var AST = {};

AST.chainFilters = function(filters, callback) {
	return function(node) {
		for (var i = 0; i < filters.length; i++) {
			if (filters[i](node)) {
				// If it is the last one, we apply the callback.
				if (i == filters.length - 1) {
					callback(node);
				}
			} else {
				return false;
			}
		}
	};
};

AST.typeFilter = function(type) {
	return function(node) {
		return node.type === type;
	}
};

AST.callFilter = AST.typeFilter(Types.CALL);

/**
 * This filter supports filtering out for particular method calls.
 * You can pass a variadic number of calls to filter.
 * @param  {...string} name The method names.
 * @return {function(Object):boolean}      The filtering function for these argments.
 */
AST.methodCallFilter = function() {
	// Convert to object for faster lookup.
	var names = {};
	var args = Array.prototype.slice.call(arguments);
	for (var i = 0; i < args.length; i++) {
		names[args[i]] = true;
	}

	return function(node) {
		if (!node.callee) {
			return false;
		}
		// Note that we have to do === true as we don't want to capture methods
		// which exist on the names object (eg. toString).
		if (node.callee.type === Types.IDENTIFIER) {
			return names[node.callee.name] === true;
		} else if (node.callee.type == Types.MEMBER) {
			// We need to handle both calls using an array and identifier.
			if (node.callee.property.type === Types.IDENTIFIER) {
				return names[node.callee.property.name] === true;
			} else if (node.callee.property.type === Types.LITERAL) {
				return names[node.callee.property.value] === true;
			}
		}
		return false;
	}
};

AST.coerceName = function(node, mapping, returnNull) {
	if (node.type === Types.IDENTIFIER) {
		return node.name;
	} else if (node.type === Types.LITERAL) {
		return node.value;
	} else if (node.type === Types.MEMBER) {
		if (!node.computed) {
			return AST.coerceName(node.object, mapping, returnNull) + '.' +
					AST.coerceName(node.property, mapping, returnNull);
		} else {
			if (node.property.type === Types.IDENTIFIER) {
				return AST.coerceName(node.object, mapping, returnNull) + '.' +
						AST.coerceName(AST.rootValue(node.object, mapping), mapping, returnNull);
			} else if (node.property.type === Types.LITERAL) {
				return AST.coerceName(node.object, mapping, returnNull) + '.' + 
						AST.coerceName(node.property, mapping, returnNull);
			} else {
				if (returnNull) {
					return null;
				} else {
					throw new Error('Could not coerce name of node.', node);
				}
			}
		}
	} else {
		if (returnNull) {
			return null;
		} else {
			throw new Error('Could not coerce name of node.', node);
		}
	}
};

/**
 * Given an expression, it will form an array of all names, 
 * starting from most specific to least. For example a.b.c will
 * return the array ['a.b.c', 'a.b', 'a'];
 * 
 * @param  {Object} node The AST node of the expressioncd
 * @param  {Object} mapping The variable mapping
 * @param  {boolean?} returnNull Optional variable. If true, null is returned
 *                               when a variable can't be coerced instead of an error.
 * @return {Array<string>}         An array of strings containing the names.
 */
AST.coerceAllNames = function(node, mapping, returnNull) {
	var names = [];
	if (node.type === Types.MEMBER) {
		while (true) {
			names.push(AST.coerceName(node, mapping, returnNull));
			if (node.type === Types.MEMBER) {
				node = node.object;
			} else {
				break;
			}
		}
	} else {
		names.push(AST.coerceName(node, mapping, returnNull));
	}
	return names;
};

/**
 * Given a variable, determines the actual value in a mapping.
 * Note that this accounts for variable aliasing, so if you do
 * a = 2, b = a, the root value of b is 2.
 * @param  {string} variable The variable name.
 * @param  {Object} mapping  The mapping of variable names to values.
 * @return {Object?}          An object if the variable is assigned, else undefined.
 */
AST.rootValue = function(variable, mapping) {
	// Iterate up the chain of assignments until we reach a non-identifier.
	while (mapping[variable]) {
		var name = AST.coerceName(mapping[variable], mapping);
		if ((mapping[variable].type === Types.IDENTIFIER || mapping[variable].types === Types.MEMBER) &&
			  name !== variable) {
			variable = name;
		} else {
			return mapping[variable];
		}
	}
	return undefined;
};

/**
 * Checks whether two values point to the same value. This can be used
 * to determine if a variable is aliasing another.
 * @param  {string} variable         The name of the variable.
 * @param  {string} believedVariable The name of the believed variable.
 * @param  {Object} mapping          The mapping of variable names to values.
 * @return {boolean}                  True if the variables have the same root value.
 */
AST.sameVariable = function(variable, believedVariable, mapping) {
	// Ensure both variables exist.
	if (!mapping[variable] || !mapping[believedVariable]) {
		return false;
	}

	// Resolve both root values.
	var root1 = AST.rootValue(variable, mapping);
	var root2 = AST.rootValue(believedVariable, mapping);
	return (root1 !== undefined) && (root1 == root2);
};

/**
 * Given a member expression, fetches the leftmost expression. This does
 * not check that the node is a member.
 * @param  {Object} node The AST node.
 * @return {Object}      The leftmost member.
 */
AST.getLeftmostMember = function(node) {
	while (node.type === Types.MEMBER) {
		node = node.object;
	}
	return node;
};

/**
 * Given a chain of calls and member nodes, gets the left most member.
 * eg. $route.when(a).when(b) would return $route.
 * @param  {Object} node A node of type call with alternating calls and members.
 * @return {Object?}      The calling member node. 
 *                            	If not alternating calls and members, returns null.
 */
AST.getCallingMember = function(node) {
	while (true) {
		if (node.type === Types.CALL) {
			node = node.callee;
		} else if (node.type == Types.MEMBER) {
			if (node.object.type === Types.CALL) {
				node = node.object;
			} else {
				return node;
			}
		} else {
			return null; 
		}
	}
}

/**
 * Determines whether a given node represents an object
 * of a given type. If the node is not the type but is
 * instead an identifier, it is resolved using a variable
 * mapping to see if it was assigned a different type. This
 * cannot be used with nodes where a literal is expected.
 * 
 * @param  {Object}  node    The AST node.
 * @param  {Object}  mapping The variable mapping.
 * @param  {string}  type    The expected type.
 * @return {Boolean}         True if the node has the specified type
 *                                or is an identifier of a variable
 *                                which is holding a value of the 
 *                                specified type.	
 */
AST.isType = function(node, mapping, type) {
	if (node.type === type) return true;
	if (node.type !== Types.IDENTIFIER) return false;

	var root = AST.rootValue(node.name, mapping);
	if (!root) return false;

	return root.type === type;
};



/**
 * Processes a given AST node, building up a variable mapping as it goes on.
 * @param  {Node} node        The AST node.
 * @param  {Object} mapping     The variable mapping.
 * @param  {boolean} conditional True if we are currently within a conditional statement. This
 *                               is used when encountering an assignment, to determine if the
 *                               variable is certainly or possibly a given value.
 * @param  {function(Node, Object, boolean)} exprFn      The function to call when an expression is reached.
 *                                 It is told whether it is currently in a conditional state or not.
 */
AST.descendNode = function(node, mapping, conditional, exprFn) {
	if (node == null) {
		// Ignore
	} else if (node.type === Types.LITERAL) {
		// ignore
	} else if (node.type === Types.BLOCK || node.type === Types.PROGRAM)  {
		for (var i = 0; i < node.body.length; i++) {
			AST.descendNode(node.body[i], mapping, conditional, exprFn);
		}
	} else if (node.type === Types.DECLARATION) {
		this.handleDeclarationNode_(node, mapping, conditional, exprFn);
	} else if (node.type === Types.IF) {
		// Add both the if and the else branch conditionally.
		AST.descendNode(node.consequent, mapping, true, exprFn);
		AST.descendNode(node.alternate, mapping, true, exprFn);
	} else if (node.type === Types.WHILE || node.type === Types.DO_WHILE) {
		// Add the body of the loop conditionally.
		AST.descendNode(node.body, mapping, true, exprFn);
	} else if (node.type === Types.FOR) {
		// Add the initializer based on conditional value. The update and the body are
		// added conditionally.
		AST.descendNode(node.init, mapping, conditional, exprFn);
		AST.descendNode(node.update, mapping, true, exprFn);
		AST.descendNode(node.body, mapping, true, exprFn);
	} else if (node.type === Types.TRY) {
		// The try body and the catch clauses are added conditionally.
		AST.descendNode(node.block, mapping, true, exprFn);
		// TODO: Should properly handle the name of the variable in the try.
		for (var i = 0; i < node.handlers.length; i++) {
			AST.descendNode(node.handlers[i].body, mapping, true, exprFn);
		}
		// The finalizer is added based on the conditional value.
		AST.descendNode(node.finalizer, mapping, conditional, exprFn);
	} else if (node.type === Types.RETURN) {
		AST.descendNode(node.argument, mapping, conditional, exprFn);
	} else if (node.type === Types.SEQUENCE) {
		// Convert each inner sequence expression to a new expression and descend.
		for (var i = 0; i < node.expressions.length; i++) {
			AST.descendNode({
				type: Types.EXPRESSION,
				expression: node.expressions[i]
			}, mapping, conditional, exprFn);
		}
	} else if (node.type === Types.EXPRESSION) {
		var expr = node.expression;
		if (expr.type === Types.ASSIGNMENT) {
			this.handleAssignmentNode_(expr, mapping, conditional, exprFn);
		} 
		exprFn(expr, mapping, conditional);
	} else if (node.type === Types.CALL) {
		exprFn(node, mapping, conditional);
	}
};

/**
 * Helper function for handling a declaration node while descending.
 * @param  {Node} node        The AST node containing the assignment.
 * @param  {Object} mapping     The object containing the variable mappings.
 * @param  {boolean} conditional True if currently in a conditional scope.
 * @param  {function(Node, Object, boolean)} exprFn      The function to call when an expression is reached.
 *                                 It is told whether it is currently in a conditional state or not.
 */
AST.handleDeclarationNode_ = function(node, mapping, conditional, exprFn) {
	for (var i = 0; i < node.declarations; i++) {
		var identifier = node.declarations[i].id.name;
		var value = node.declarations[i].init;

		// We first process the right hand side in case a service is being called.
		AST.descendNode(value, mapping, conditional, exprFn);

		AST.addValueWrapper_(mapping, identifier, value, conditional);
	}
};

/**
 * Helper function for handling an assignment node while descending.
 * @param  {Node} node        The AST node containing the assignment.
 * @param  {Object} mapping     The object containing the variable mappings.
 * @param  {boolean} conditional True if currently in a conditional scope.
 * @param  {function(Node, Object, boolean)} exprFn      The function to call when an expression is reached.
 *                                 It is told whether it is currently in a conditional state or not.
 */
AST.handleAssignmentNode_ = function(node, mapping, conditional, exprFn) {
	AST.descendNode(node.right, mapping, conditional, exprFn);
	var name = AST.coerceName(node.left, mapping, true);
	if (name) {
		AST.addValueWrapper_(mapping, name, node.right, conditional);
	}
};

/**
 * Adds a value assignment to the mapping. If the conditional value is false, then
 * the original value's mapping is overridden with the new Certain value. 
 * If it is conditional, any existing value is converted to Possible and the
 * value is added.
 * @param {Object} mapping     The object containing the variable mappings.
 * @param {string} name        The name of the variable.
 * @param {Object} value       The new assigned value.
 * @param {boolean} conditional True if this is a possible assignment, else false.
 */
AST.addValueWrapper_ = function(mapping, name, value, conditional) {
	// If we aren't in conditional, simply update the mapping.
	if (!conditional) {
		mapping[name] = [
			new ValueWrapper(value, false)
		];
	} else {
		if (!mapping[name]) {
			mapping[name] = [];
		}
		// First we convert all mapping values to possible, as the value may have updated.
		mapping[name] = mapping[name].map(function(wrapper) {
			return wrapper.possibly();
		});
		mapping[name].push(new ValueWrapper(value, true));
	}
};