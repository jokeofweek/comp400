var Routes = {};

/**
 * Builds an object representing a route, which includes the regular expression
 * as well as the variables. 
 * 
 * Note: This was taken from the Angular.js codebase.
 * @param  {string} path The path string for the route.
 * @return {Object} The object representing the route.
 */
Routes.buildRouteObject = function(path) {
	// Always put closing path.
	if (path.substr(-1) !== '/') {
		path += '/';
	}
  var insensitive = true,
      ret = {
        originalPath: path,
        regexp: path
      },
      keys = ret.keys = [];

  path = path
    .replace(/([().])/g, '\\$1')
    .replace(/(\/)?:(\w+)([\?\*])?/g, function(_, slash, key, option) {
      var optional = option === '?' ? option : null;
      var star = option === '*' ? option : null;
      keys.push({ name: key, optional: !!optional });
      slash = slash || '';
      return ''
        + (optional ? '' : slash)
        + '(?:'
        + (optional ? slash : '')
        + (star && '(.+?)' || '([^/]+)')
        + (optional || '')
        + ')'
        + (optional || '');
    })
    .replace(/([\/$\*])/g, '\\$1');

  ret.regexp = new RegExp('^' + path + '$', insensitive ? 'i' : '');
  return ret;
}

/**
 * Builds a route mapping function for a specific path. This function can
 * then be used to pull out the metadata from a string if it matches the route.
 * @param  {string} route The path, showing variables as defined by angular (eg. /get/:color)
 * @return {function(string):Object?} A function which, when passed the current
 *  location, will try to match it to the route. If it does not match, null is returned.
 *  If it does match, an object is returned wtih the route variables.
 */
Routes.buildRouteExtracterFn = function(route) {
	var routeObj = Routes.buildRouteObject(route);

	return function(path) {
		// Always put closing path.
		if (path.substr(-1) !== '/') {
			path += "/";
		}

		var params = {};
		var keys = routeObj.keys;
  	var m = routeObj.regexp.exec(path);
    if (!m) return null;

    for (var i = 1, len = m.length; i < len; ++i) {
      var key = keys[i - 1];

      var val = m[i];

      if (key && val) {
        params[key.name] = val;
      }
    }
    return params;
	};
};