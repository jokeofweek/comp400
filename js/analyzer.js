function Analyzer(model) {
	this.model_ = model;
	// This is an array of tuples where the first index is the controller name
	// (or default) and the route mapping function.
	this.controllerRoutes_ = [];
	// A map of IDs to their corresponding DOM nodes.
	this.idAssignments_ = {};
	// A list of unbound trigger matching functions. This might be caused by 
	// a controller not being loaded when a trigger tries to refer to it.
	this.lazyTriggers_ = [];
};

Analyzer.DEFAULT_CONTEXT_ = 'default';
Analyzer.DEFAULT_ROUTE_ = 'default';

Analyzer.prototype.start = function(path, html, ast) {
	console.log('Starting analysis for: ' + path);

	this.findDependencies_(html, ast);
	this.findRoutes_(html, ast);

	// Find all the defined contexts.
	this.findContexts_(html, ast);

	// Test if we are in a controller based on the application path. If not,
	// we will have to create a new default controller.
	var defaultDom = DOM.filter(html, function(node) {
		return !DOM.attribute(node, 'ng-controller');
	});
	var pathData = this.getDataForPath(path);
	var defaultContext;
	if (pathData) {
		var ctx = this.model_.getContext(pathData.controller);
		// If there is a context and it doesn't already have a DOM, this context
		// will be the default context and it's DOM is updated.
		if (!ctx.hasDom()) {
			ctx.setDom(defaultDom);
			defaultContext = ctx;
		}
		// TODO: Maybe use metadata?
	} 

	if (!defaultContext) {
		var defaultContext = new Model.Context(Analyzer.DEFAULT_CONTEXT_, defaultDom);
		this.model_.registerContext(defaultContext);
	}

	// Create the default context.
	this.processContextDom_(defaultContext, defaultDom, {});

	// Process any lazy triggers.
	for (var i = 0; i < this.lazyTriggers_.length; i++) {
		this.lazyTriggers_[i]();
	}

	this.model_.done();
};

Analyzer.prototype.findDependencies_ = function(html, ast) {
	var model = this.model_;
	var self = this;

	// Register all module creations.
	var filters = [AST.callFilter, AST.methodCallFilter('module', 'factory')];
	estraverse.traverse(ast, {
		enter: AST.chainFilters(filters, function(node) {
			if (!node.arguments[0]) {
				console.log('module/factory call with no arguments.');
			} else if (node.arguments[0].type !== Types.LITERAL) {
				console.log('module/factory call with name passed as a non-literal.');
			} else {
				var dependency = model.registerDependency(node.arguments[0].value);
				// Find used dependencies on any injected function.
				if (node.arguments[1]) {
					var used = self.findUsedDependencies_(node.arguments[1]);
					for (var i = 0; i < used.length; i++) {
						dependency.registerDependency(used[i]);
					}
				}
			}
		})
	});

	// Find all function declarations, which may be used by the provider.
	var functions = {};
	estraverse.traverse(ast, {
		enter: AST.chainFilters([AST.typeFilter(Types.FUNCTION_DECLARATION)], function(node) {
			
			if (!functions[node.id.name] || !(functions[node.id.name] instanceof Array)) {
				functions[node.id.name] = [];
			}
			functions[node.id.name].push(node);
		})
	});

	// Register all objects registered with the injector.
	estraverse.traverse(ast, {
		enter: AST.chainFilters([AST.callFilter, AST.methodCallFilter('provider')], function(node) {
			if (node.arguments.length !== 1 || node.arguments[0].type !== Types.OBJECT) {
				return;
			}
			// Register all the provided keys.
			for (var i = 0; i < node.arguments[0].properties.length; i++) {
				var key = node.arguments[0].properties[i].key;
				var val = node.arguments[0].properties[i].value;
				if (key.type === Types.IDENTIFIER) {
					var dep = model.registerDependency(key.name);

					// If we have the function for the provider, analyze it for 
					// a $get definition.
					if (val.type === Types.FUNCTION) {
						this.analyzeProviderFunction_(dep, val);
					} else if (val.type === Types.IDENTIFIER) {
						// If we correspond to a particular global function, analyze that.
						// We have to look through all possible functions, as the code
						// may be re-using minified function names.
						if (functions[val.name]) {
							for (var j = 0; j < functions[val.name].length; j++) {
								this.analyzeProviderFunction_(dep, functions[val.name][j]);
							}
						}
					}
				} else {
					console.log('Unsupported provider key type: ' + key.type);
				}
			}
		}.bind(this))
	})
};

/**
 * Given an injected function node, it examines the used dependencies.
 * @param  {Object} injectedFnNode Either a function with hardcoded parameter names or
 *                         an array containing the injected services and a function
 *                         as the last variable with the renamed variables.
 * @return {Array}        An array containing the name of the used dependencies.
 */
Analyzer.prototype.findUsedDependencies_ = function(injectedFnNode) {
	
	var deps = [];
	if (injectedFnNode.type == Types.ARRAY) {
		deps = clone(injectedFnNode.elements);
		deps.pop();
		deps = deps.map(function(dep) {
			return dep.value;
		});
	} else if (injectedFnNode.type == Types.FUNCTION) {
		deps = injectedFnNode.params;
		deps = deps.map(function(dep) {
			return dep.name;
		});
	}
	return deps;
};

Analyzer.prototype.analyzeProviderFunction_ = function(dependency, fnNode) {
	// Search for a this.$get call.
	AST.descendNode(fnNode.body, {}, true, function(expr, mapping, conditional) {
		if (this.isGetAssignment_(expr)) {
			// For the used dependencies of providers, we simply grab all the ones
			// used in the $get function.
			var deps = this.findUsedDependencies_(expr.right);
			for (var i = 0; i < deps.length; i++) {
				dependency.registerDependency(deps[i]);
			}
		}
	}.bind(this));
};

/**
 * Determines if a given expression is assigning a function
 * to this.$get. This is used by providers.
 * @param {Object} node The AST node.
 * @return {boolean} True if the node is of the form this.$get = <expr>.
 */
Analyzer.prototype.isGetAssignment_ = function(node) {
	if (node.type !== Types.ASSIGNMENT) return false;
	if (node.left.type !== Types.MEMBER) return false;
	if (node.left.object.type !== Types.THIS) return false;
	if (node.left.property.type !== Types.IDENTIFIER ||
		  node.left.property.name !== '$get') {
		return false;
	}

	// TODO: Instead of only working if the right side is a function, this
	// should do a variable lookup. The reason it doesn't right now is that
	// the mapping may have more than one possible value, so the expected
	// behavior is a little bit unclear - should it return true if and only if
	// each value is a function?
	return node.right.type === Types.FUNCTION ||
				 node.right.type === Types.ARRAY;
};

/**
 * Searches through the AST for config nodes, which are used to set up routes.
 * @param  {Object} html
 * @param  {Object} ast
 */
Analyzer.prototype.findRoutes_ = function(html, ast) {
	var self = this;
	var model = this.model_;

	// Find all configs.
	estraverse.traverse(ast, {
		enter: AST.chainFilters([AST.callFilter, AST.methodCallFilter('config')], function(node) {
			if (node.arguments.length == 1) {
				var mappings = {};
				var fnNode = self.addInjectedMappings_(node.arguments[0], mappings);
				if (self.hasRouteProvider_(mappings)) {
					console.log("Config found with route provider.")
					self.extractRoutesFromRouteProviderConfig_(fnNode, mappings);
				}
			} else {
				console.log('Hit config node with no function.');				
			}
		})
	});
};

/**
 * Checks if a given variable mapping has at least one variable which may map to the
 * $routeProvider service.
 * @param  {Object}  mappings
 * @return {Boolean} True if at least one variable possibly maps to $routeProvider.
 */	
Analyzer.prototype.hasRouteProvider_ = function(mappings) {
	for (var key in mappings) {
		// If we have a value which could potentially map to the route provider, then
		// we are good.
		if (ValueWrapper.getRootValues(key, mappings)['$routeProvider'] !== undefined) {
			return true;
		}
	}
	return false;
};

/**
 * Given a configuration confunction which has a routeProvider variable, finds all
 * declared routes and adds them to the array.
 * @param  {Object} fnNode  The AST node for the config function.
 * @param  {Object} mapping The variable mapping.
 */
Analyzer.prototype.extractRoutesFromRouteProviderConfig_ = function(fnNode, mapping) {
	var exprs = fnNode.body.body;

	for (var i = 0; i < exprs.length; i++) {
		AST.descendNode(exprs[i], mapping, false, function(expr, mapping, conditional) {
			if (expr.type !== Types.CALL) return;
			if (expr.callee.type !== Types.MEMBER) return;

			var caller = AST.getCallingMember(expr);
			if (caller.object.type !== Types.IDENTIFIER);

			// Find the caller's aliases.
			var aliases = ValueWrapper.getRootValues(caller.object.name, mapping);

			// If the variable is not aliasing routeProvider, leave.
			if (!aliases['$routeProvider']) return;

			// This is a route provider call! Find all .when calls and process them. 
			// Note that, calls are nested from left to right, we need to put them all
			// in a list and then go through them in reverse to preserve order.
			var routes = [];

			while (expr.type === Types.CALL) {
				if (expr.callee.type !== Types.MEMBER) break;

				var name = null;
				var prop = expr.callee.property;
				if (prop.type === Types.IDENTIFIER) {
					name = prop.name;
				} else if (prop.type === Types.LITERAL) {
					name = prop.value;
				}

				var route = null;
				if (name === 'when') {
					if (expr.arguments.length !== 2) {
						console.log('Invalid when call. Not 2 argument.');
						break;
					}

					if (expr.arguments[0].type !== Types.LITERAL) {
						console.log('Invalid when call. Expected string as first argument, but received ' + expr.argument[0].type +'.');
						break;
					}

					if (expr.arguments[1].type !== Types.OBJECT) {
						console.log('Invalid when call. Expected object as second argument, but received ' + expr.argument[1].type +'.');
						break;
					}

					route = this.extractRouteFromRouteProviderWhenCall_(expr.arguments[0].value, expr.arguments[1]);
				} else if (name === 'otherwise') {
					if (expr.arguments.length !== 1) {
						console.log('Invalid otherwise call. Not 1 argument.');
						break;
					}
					route = this.extractRouteFromRouteProviderOtherwiseCall_(expr.arguments[0]);
				} else {
					break;
				}

				// Add any route which was found.
				if (route) {
					routes.push(route);
				}

				// Go one step more.
				expr = expr.callee.object;
			}

			for (var i = routes.length - 1; i >= 0; i--) {
				// If it is not the default, we build the extracter. If it is the default, we keep the
				// path in order to find which is the default controller.
				if (routes[i][0] === Analyzer.DEFAULT_ROUTE_) {
					this.controllerRoutes_.push(routes[i]);
				} else {
					this.controllerRoutes_.push([routes[i][0], Routes.buildRouteExtracterFn(routes[i][1])]);
				}
			};
		}.bind(this));
	}
};


/**
 * Finds the controller for a given path.
 * @param  {string} path          The path to lookup.
 * @param  {boolean} ignoreDefault True if we should ignore the default route.
 * @return {Object?}           	  If a route was found, an object is returned. It
 *                                  contains a key 'controller' and a key 'metadata'
 */
Analyzer.prototype.getDataForPath = function(path, ignoreDefault) {
	var defaultValue = null;
	// Search all routes, stopping at the first non-default we match.
	for (var i = 0; i < this.controllerRoutes_.length; i++) {
		var route = this.controllerRoutes_[i];
		if (route[0] === Analyzer.DEFAULT_ROUTE_) {
			defaultValue = route[1];
		} else {
			var result = route[1](path);
			if (result !== null) {
				return {
					controller: route[0],
					metadata: result
				}
			}
		}
	}
	// If no routes were found and a defualt path was found, we search for that instead.
	if (defaultValue && !ignoreDefault) {
		return this.getDataForPath(defaultValue, true);
	} 
	return null;
};


/**
 * Given the argument past to a $routeProvider.when call, builds a
 * route tuple.
 * @param  {string} path The route path.
 * @param  {Object} obj The AST node representing the route argument passed to when.
 * @return {Array?} A tuple containing the route controller and the route path.
 */
Analyzer.prototype.extractRouteFromRouteProviderWhenCall_ = function(path, obj) {
	// Find the controller property of the object.
	for (var i = 0; i < obj.properties.length; i++) {
		if (obj.properties[i].key.name === 'controller') {
			if (obj.properties[i].value.type === Types.LITERAL) {
				return [obj.properties[i].value.value, path];
			} else if (obj.properties[i].value.type === Types.IDENTIFIER) {
				return [obj.properties[i].value.name, path];
			}
		}
	}

	console.log('Could not parse when call. Expected an object with a ' +
			'controller key containing a literal.');

	return null;
};

/**
 * Given the argument past to a $routeProvider.otherwise call, builds a
 * route tuple.
 * @param  {Object} obj The AST node representing the argument passed to otherwise.
 * @return {Array?} A tuple containing the route controller (defualt in this case)
 *                  and the route path.
 */
Analyzer.prototype.extractRouteFromRouteProviderOtherwiseCall_ = function(obj) {
	if (obj.type === Types.LITERAL) {
		routes.push([Analyzer.DEFAULT_ROUTE_, obj.value])
	} else if (obj.type === Types.OBJECT) {
		// Search for the redirectTo property.
		var found = false;
		for (var i = 0; i < obj.properties.length; i++) {
			if (obj.properties[i].key.name === 'redirectTo' &&
				  obj.properties[i].value.type === Types.LITERAL) {
				found = true;
				return [Analyzer.DEFAULT_ROUTE_, obj.properties[i].value.value];
			}
		}
		if (!found) {
			console.log('Could not parse otherwise call. Expected an object with a ' +
					'redirectTo key containing a literal.');
		}
	} else {
		console.log('Invalid otherwise call. Expected string or object as first parameter, received ' + 
				obj.type + '.');
	}
	return null;
};

Analyzer.prototype.findContexts_ = function(html, ast) {
	var model = this.model_;

	// Find all the elements associated with a controller and create
	// a mapping of DOM elements to contexts.
	var domMapping = {};
	DOM.traverse(html, function(node) {
		var controller = DOM.attribute(node, 'ng-controller');
		if (controller) {
			domMapping[controller] = node;
		}
	});

	// Identify all controllers defined in Javascript.
	var extractContext = this.extractContext_.bind(this);
	estraverse.traverse(ast, {
		enter: AST.chainFilters([AST.callFilter, AST.methodCallFilter('controller')], function(node) {
			if (node.arguments.length < 1) {
				console.log('Controller defined with no arguments.');
				return;
			} else {
				if (node.arguments[0].type !== Types.LITERAL) {
					console.log('Controller defined with non-literal name.');
					return;
				} else {
					if (node.arguments[0].type !== Types.LITERAL) {
						console.log('Controller defined with non-literal name.');
						return;
					}
					var name = node.arguments[0].value;
					if (node.arguments.length < 2) {
						console.log('Controller ' + name + ' missing second argument or defined with non-array as second argument.');
						return;
					}
					extractContext(name, node.arguments[1], domMapping);
				}
			}
		})
	});
	estraverse.traverse(ast, {
		enter: AST.chainFilters([AST.typeFilter(Types.FUNCTION_DECLARATION)], function(node) {
			// If this function declaration has the same name as a controller found in the DOM or
			// ends by Ctrl, we register it.
			var name = node.id.name;

			if (domMapping[name] !== true && name.substr(-4) !== 'Ctrl') {
				return;
			}

			// Change the type to a function before passing it along.
			node.type = Types.FUNCTION;

			extractContext(name, node, domMapping);
		})
	});
};

/**
 * Given an AST node declaring an Angular controller and its corresponding
 * DOM mapping, builds a context for the model.
 * @param {string} name The name of the context.
 * @param {Object} node Either the array representing an injected function, or
 * the function itself.
 * @param {Object} domMapping The DOM mapping.
 */
Analyzer.prototype.extractContext_ = function(name, node, domMapping) {
	var context = new Model.Context(name, domMapping[name]);
	this.model_.registerContext(context);

	// Try to parse out the controller function from the arguments.
	var variableMapping = {};
	var fnNode = this.addInjectedMappings_(node, variableMapping);

	if (!fnNode) {
		return;
	}

	this.processContextFunction_(context, fnNode, variableMapping, domMapping);
	if (domMapping[name]) {
		this.processContextDom_(context, domMapping[name], variableMapping);
	}
};

/**
 * Given the declaration for some kind function with injected vars, this will augment
 * the mapping. This handles the case where the function is
 * declared directly as well as the case where a function is wrapped in 
 * an array to preserve dependency injection while renaming variables.
 * @param {Object} node    The AST node for the parameter.
 * @param {Object} mapping The mapping object for variables
 * @return {Object?} The AST node for the actual function, or null if 
 *                       an error occurred.
 */
Analyzer.prototype.addInjectedMappings_ = function(node, mapping) {
	if (node.type === Types.ARRAY) {
		// Extract the function.
		if (node.elements.length == 0) {
			// console.log('Node could not be expanded to add to mapping. Empty array passed as function.');
			return null;
		}
		var fn = node.elements[node.elements.length - 1];
		if (fn.type !== Types.FUNCTION) {
			console.log('Last argument in injected mapping was not a function.');
			return null;
		}

		// Identify all argument names being used as injected services in the
		// controller and map them to their respective service literal.
		for (var i = 0; i < node.elements.length - 1; i++) {
			// Ensure that the variable is actually used by the function.
			if (fn.params.length == i) { 
				break;
			}
			if (fn.params[i].type !== Types.IDENTIFIER) {
				console.log('Non-identifier as its function argument at index ' + i);
				return null;
			}
			// For now, since usually this is being used for renaming, we convert the literal dependency name to
			// an identifier.
			var ident = node.elements[i];
			if (ident.type === Types.LITERAL) {
				var ident = {
					type: Types.IDENTIFIER,
					name: node.elements[i].value
				};
			} 
			mapping[fn.params[i].name] = [
				new ValueWrapper(ident, false)
			];
		}

		return fn;
	} else if (node.type === Types.FUNCTION) {
		for (var i = 0; i < node.params.length; i++) {
			mapping[node.params[i].name] = [
				new ValueWrapper(node.params[i], false)
			];
		}
		return node;
	} else {
		console.log('Node could not be expanded to add to mapping.');
		return null;
	}
};

/**
 * Determines whether a particular assignment is to the $scope variable.
 * @param  {Object}  node    The node.
 * @param  {Object}  mapping The variable mapping.
 * @return {Boolean}         True if the node is of the form $scope.* = *
 */
Analyzer.prototype.isScopeAssignment_ = function(node, mapping) {
	if (node.type !== Types.ASSIGNMENT) return false;
	if (node.left.type !== Types.MEMBER) return false;
	
	// Extract leftmost value and check if it is $scope.
	var root = AST.getLeftmostMember(node.left);
	if (root.type !== Types.IDENTIFIER) return false;

	if (root.name !== '$scope') {
		var rootValues = ValueWrapper.getRootValues(root.name, mapping);
		if (!rootValues['$scope']) return false;
	}

	return true;
};

/**
 * Determines if a given expression is assigning a function
 * to the $scope object.
 */
Analyzer.prototype.isScopeFunctionAssignment_ = function(node, mapping) {
	// TODO: Instead of only working if the right side is a function, this
	// should do a variable lookup. The reason it doesn't right now is that
	// the mapping may have more than one possible value, so the expected
	// behavior is a little bit unclear - should it return true if and only if
	// each value is a function?
	return this.isScopeAssignment_(node, mapping) && 
			node.right.type === Types.FUNCTION;
};

/**
 * Determines if a given expression is assigning a dependency function
 * to the $scope object. If so, it builds a trigger for it.
 * 
 */
Analyzer.prototype.checkForScopeDependencyAssignment_ = function(context, node, mapping) {
	if (!this.isScopeAssignment_(node, mapping)) return false;
	if (node.right.type !== Types.MEMBER) return false;
	

	var names = AST.coerceAllNames(node.right);
	for (var i = 0; i < names.length; i++) {
		if (!names[i]) continue;
		var dep = this.model_.findDependency(names[i]);
		if (dep) {
			var trigger = new Model.Trigger(AST.coerceName(node.left.property, mapping));
			context.registerTrigger(trigger);
			trigger.addSideEffect(this.getDependencySideEffect(
					trigger, dep, names[i], names[0], [], false));
			return;
		}
	}
};

/**
 * Augments a context by analyzing its function for any context function declarations.
 * @param  {Model.Context}   context The context to agument.
 * @param  {Node} fnNode      The node representing the function.
 * @param  {Object}   mapping A mapping of variable names to values.
 */
Analyzer.prototype.processContextFunction_ = function(context, fnNode, mapping) {
	// Assert that the function has a block statement as a body.
	if (fnNode.body.type !== Types.BLOCK) {
		throw new Error('Context ' + context.getName() + ' tried to be augmented wtih a function which did not contain a block.');
	}
	var exprs = fnNode.body.body;

	for (var i = 0; i < exprs.length; i++) {
		AST.descendNode(exprs[i], mapping, false, function(expr, mapping, conditional) {
			if (this.isScopeFunctionAssignment_(expr, mapping)) {
				this.extractTrigger_(context, expr, mapping);	
			} else {
				this.checkForScopeDependencyAssignment_(context, expr, mapping);
			}
		}.bind(this));
	}	
};

/**
 * Extracts a trigger from a scope assignment node.
 * @param  {Model.Context} context The context to which this
 *                                 trigger will belong.
 * @param  {Object} expr    An AST node containing an expression
 *                          of the form $scope.name = fn
 */
Analyzer.prototype.extractTrigger_ = function(context, expr, mapping) {
	// Get the trigger name (rightmost point of the assignment).
	var name = AST.coerceName(expr.left.property, mapping);

	// Get the function, which may be behind a variable.
	var fn = expr.right;
	if (fn.type === Types.IDENTIFIER) {
		fn = AST.rootValue(fn, mapping);
	}
	if (fn.type !== Types.FUNCTION) {
		throw new Error('Tried to extract trigger from non-function.');
	}

	// Create the trigger with the name and associate the function paremeters
	// as the trigger's metadata.
	var trigger = new Model.Trigger(name);
	trigger.setMetadata(fn.params.map(function(param) {
		return param.name;
	}));

	context.registerTrigger(trigger);
	this.processTriggerAST_(trigger, fn.body, mapping);
};

Analyzer.prototype.processContextDom_ = function(context, dom, mapping) {
	var events = ['ng-click', 'ng-dbl-click', 'ng-mousedown', 'ng-mouseup', 
			'ng-mouseenter', 'ng-mouseleave', 'ng-mousemove', 'ng-mouseover', 
			'ng-keydown', 'ng-keyup', 'ng-keypress', 'ng-change', 'ng-submit',
			'ng-show', 'href'];
	DOM.traverse(dom, function(node) {
		// Check all angular event directives to see if any are used by
		// this DOM node.
		for (var i = 0; i < events.length; i++) {
			var value = DOM.attribute(node, events[i]);
			if (value) {
				var initialValue = value;
				// If the node does not already have an ID, generate it.
				if (!node.generatedId) {
					node.generatedId = DOMIdGenerator.get();
					this.idAssignments_[node.generatedId] = node;
				}
				// Create the trigger
				if (events[i] == 'href') {
					if (value == '#') continue;
					
					var trigger = new Model.DOMTrigger(
							node.generatedId + '-href',
							node);
					context.registerTrigger(trigger);

					if (value[0] == '/') {
						// Get rid of hash paths.
						if (value.substring(0, 2) == '/#') {
							value = value.substring(2);
							if (value.length === 0 || value[0] !== '/') {
								value = '/' + value;
							}
						}
						// Find matching route data.
						var route = this.getDataForPath(value);
						if (route !== null) {
							trigger.addSideEffect(new Model.TransitionSideEffect(
									trigger, initialValue, route.controller, route.metadata));
						} else {
							trigger.addSideEffect(new Model.ExitApplicationSideEffect(
									trigger, value));
						}
					} else {
						trigger.addSideEffect(new Model.ExitApplicationSideEffect(
								trigger, value));
					}
				} else {
					var trigger = new Model.DOMTrigger(
							node.generatedId + '-' + events[i].split('-')[1],
							node);
					context.registerTrigger(trigger);

					// Parse the event
					var ast = esprima.parse(value);
					if (ast.type === Types.PROGRAM) {
						this.processEventAST_(trigger, ast, mapping);
					}
				}
			}
		}
	}.bind(this));
};

Analyzer.prototype.processEventAST_ = function(trigger, ast) {
	var lazyTriggerFn = function(trigger, expr, funcName) {
		var contexts = this.model_.getContexts();
		var depFound = false;
		// Look at all model contexts in case we are including another context.
		for (var i = 0; i < contexts.length; i++) {
			calledTrigger = this.model_.getContext(contexts[i]).findTrigger(funcName);
			if (calledTrigger) {
				trigger.addSideEffect(new Model.CallTriggerSideEffect(
						calledTrigger, expr.arguments, false));
				trigger.getContext().addIncludedContext(contexts[i]);
				depFound = true;
			}
		}

		if (!depFound) {
			console.log('Unfound referenced trigger: ' + funcName);
		}
	};

	AST.descendNode(ast, {}, false, function(expr, mapping, conditional) {
		if (expr.type === Types.CALL) {
			var funcName = AST.coerceName(expr.callee);
			var calledTrigger = trigger.getContext().findTrigger(funcName);

			// TODO: Register metadata.
			
			if (calledTrigger) {
				trigger.addSideEffect(new Model.CallTriggerSideEffect(
						calledTrigger, expr.arguments));
			} else {
				// Check if a dependency exists with that name
				var names = AST.coerceAllNames(expr.callee);
				var depFound = false;

				for (var i = 0; i < names.length; i++) {
					if (!names[i]) continue;
					var dep = this.model_.findDependency(names[i]);
					if (dep) {
						trigger.addSideEffect(this.getDependencySideEffect(
								trigger, dep, names[i], names[0], expr.arguments, false));
						depFound = true;
						break;
					}
				}

				if (!depFound) {
					this.lazyTriggers_.push(lazyTriggerFn.bind(this, trigger, expr, funcName));
				}
			}
		}
	}.bind(this));
};

Analyzer.prototype.processTriggerAST_ = function(trigger, ast, mapping) {
	// Find dependency uses.
	this.findVariableUses_(
			ast,
			mapping,
			this.model_.findDependency.bind(this.model_),
			function(dependency, realVariableName, variableName, fullCall, arguments, usedConditionally) {
				trigger.addSideEffect(this.getDependencySideEffect(
						trigger,
						dependency,
						variableName,
						fullCall,
						arguments,
						usedConditionally));
			}.bind(this));
	// Find other trigger calls.
	this.findVariableUses_(
			ast,
			mapping,
			function(name) {
				if (name.indexOf('$scope.') === 0) {
					var foundTrigger = trigger.getContext().findTrigger(name.substring('$scope.'.length));
					if (foundTrigger) {
						return foundTrigger;
					}
				}
			},
			function(calledTrigger, realVariableName, variableName, fullCall, arguments, usedConditionally) {
				trigger.addSideEffect(new Model.CallTriggerSideEffect(
						calledTrigger, arguments, usedConditionally));
			}.bind(this));
};

Analyzer.prototype.findVariableUses_ = function(ast, mapping, varFinderFn, useFoundFn) {
	AST.descendNode(ast, mapping, false, function(expr, mapping, conditional) {
		if (expr.type === Types.CALL) {
			// Check if this call is to a dependency.
			var names = AST.coerceAllNames(expr.callee, mapping, true);

			// For each possible name, test if it is a dependency name or has one 
			// in its root values.
			for (var i = 0; i < names.length; i++) {
				if (!names[i]) continue;

				var found = false;
				var rootValues = ValueWrapper.getRootValues(names[i], mapping);
				for (var k in rootValues) {
					var dep = varFinderFn(k);
					if (dep) {
						// If we are in a conditional context, or we are not certain of
						// the variable assignment, the use is conditional.
						var usedConditionally = conditional;
						if (rootValues[k] == ValueWrapper.POSSIBLE) {
							usedConditionally = true;
						}

						useFoundFn(dep, k, names[i], names[0], expr.arguments, usedConditionally);
					}

					// If any dependency uses were found and we are at a certain (non-conditional) point
					// then we don't need to keep going up the name chain.
					if (found && !conditional && rootValues[k] === ValueWrapper.CERTAIN) {
						found = true;
					}
				}

				if (found) {
					break;
				}
			}
		}
	}.bind(this));
};

/**
 * Builds the DependencyUseSideEffect for a given dependency call.	
 * @param  {Model.Trigger} trigger The trigger to use as the base for the dependency.
 * @param  {Model.Dependency} dep           The dependency in use.
 * @param  {string} depName       The name referring to the dependency (eg. a.b)
 * @param  {string} qualifiedName The full method call name (eg. a.b.c)
 * @param  {Object} arguments     The arguments.
 * @param  {boolean} conditional  True if the dependency was used in a conditional fashion.
 * @return {Model.DependencyUseSideEffect}             The side effect object.
 */
Analyzer.prototype.getDependencySideEffect = function(trigger, dep, depName, qualifiedName, arguments, conditional) {
	// Extract out the call name (either empty string if the dependency is a function
	// or remove the characters for the depname as well as the .)
	var call = (depName == qualifiedName) ? '' : qualifiedName.substring(depName.length + 1);
	return new Model.DependencyUseSideEffect(trigger, dep, call, arguments, conditional);
};