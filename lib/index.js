var mime = require("mime"),
_ = require("underscore");

exports.middleware = function(router) {
	return function(req, res, next) {

		var pathParts = req.path.match(/(.*?)(?:\.(\w+))?$/),
		route         = pathParts[1],
		fileType      = pathParts[2],
		mimeType      = mime.lookup(String(fileType), 'text/plain');

		var headers = _.extend({
			fileType: fileType,
			stream: true
		}, req.headers),
		rheaders = {};



		function sendResult(err, result) {
			res.send(err ? err.stack : result);
		}



		var stream = router.
		request(route).
		query(req.query).
		filter({ method: req.method }).
		headers(headers).
		error(function(error) {
			if(error.code == 404) {
				return next();
			}
			res.send(error.stack);
		}).
		success(function(stream) {

			var rheaders = { };

			//this chunk is used to allow ajax applications to load data from the server
			rheaders['Access-Control-Allow-Origin'] =  req.headers.origin || '*';

			//is ajax
			if(req.headers['access-control-request-headers'])
			{                            
				//i believe the timestamp is used so the access control is cached client side, omitting the need
				//to hit the server on every request
				rheaders['Date'] = (new Date()).toGMTString();

				//allow the headers that were sent
				rheaders['Access-Control-Allow-Headers'] =  req.headers['access-control-request-headers'];

				//allow only the most common methods
				rheaders['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';

				//allow session data to be passed to the server from ajax. this should really be oauth since this is NOT supported
				//in older browsers
				//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
				//from W3C: The string "*" cannot be used for a resource that supports credentials.
				//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
				// r.headers['Access-Control-Allow-Credentials'] = 'true';

				//tell the client to store the access control for 17000 seconds
				rheaders['Access-Control-Max-Age'] = 17000; 

				//cache for the time to live, OR 30 days
				// headers['Expires'] = new Date(new Date().getTime() + (route.ttl.client || 3600*24*30)*1000).toGMTString();     
			}

			stream.dump({
				error: sendResult,
				headers: function(response) {

					//redirect to a different location
					if(response.redirect) {
						response.statusCode = 301;
						rheaders['Location'] = response.redirect.indexOf('://') > -1 ? response.redirect : 'http://' + (req.headers.host+'/'+response.redirect).replace(/\/+/g,'\/');
					}

					if(response.authorization) {
						rheaders['WWW-Authenticate'] = response.authorization.http;
						response.statusCode = 401;
					}

					if(response.mime) {
						mimeType = response.mime;
					}

					if(response.purge) {
						if(response.purge.regex) rheaders['X-Purge-Regex'] = response.purge.regex.toString();
						if(response.purge.path) rheaders['X-Purge-URL'] = response.purge.path;
					}

					rheaders['Connection'] 	 = 'keep-alive';
					rheaders['Content-Type']  = mimeType;
					rheaders['Cache-Control'] = 'max-age='+(response.ttl || 0)+', public';

					res.writeHead(response.statusCode || 200, rheaders);
				},
				data: function(data, encoding) {
					var chunk = data;
					if(!(chunk instanceof Buffer) && (data instanceof Object)) {
						chunk = JSON.stringify(chunk, null, 2);
						//callback provided? wrap the response up
						// if(urlParts.query.callback) chunk = urlParts.query.callback +' (' + chunk + ');';
					}
					res.write(chunk, encoding);
				},
				end: function() {
					res.end();
				}
			})
		}).
		pull();

		req.pipe(stream);

	}
}