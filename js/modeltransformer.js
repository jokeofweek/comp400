ModelTransformer = {};

var dependencyCache = {};
var contextCache = {};
var currentContext;

ModelTransformer.transform = function(model) {
	dependencyCache = {};

	// Go through the dependencies and contexts once before to
	// have a cached version for lazily expanded nodes.
	model.dependencies.map(function(dep) {
		dependencyCache[dep.name] = ModelTransformer.clean(
				ModelTransformer.transformDependency(dep));
	});
	contextCache = {};
	model.contexts.map(function(ctx) {
		contextCache[ctx.name] = ModelTransformer.clean(
				ModelTransformer.transformContextWithNoGroups(ctx));
	});

	var data = {
		name: 'Model',
		children: [
			{
				name: 'App Sections',
				children: model.contexts.map(ModelTransformer.transformContext)
			},
			{
				name: 'Libraries',
				children: ModelTransformer.groupByPrefix(
						model.dependencies.map(ModelTransformer.transformDependency), 
						DEPENDENCY_GROUPS)
			}
		]
	}

	return ModelTransformer.clean(data);
};

var TRIGGER_GROUPS = [
	'dom'
];

var DEPENDENCY_GROUPS = [
	'$', 'ui.bootstrap', 'template/', 'resources/', 'projects/', 'security.login', 'security', 'services', 'resources', 'directives', 'admin/', 'admin-'
];

var USED_FUNCTIONS_NAME_ = 'Used Functions';

ModelTransformer.clean = function(obj) {
	if (obj.children) {
		if (obj.children.length == 0) {
			obj.children = null;
		} else {
			obj.children = obj.children.map(ModelTransformer.clean);
		}
	}
	return obj;
};

ModelTransformer.groupByPrefix = function(objects, prefixes, options) {
	// Extend default options with ones passed as parameters.
	var opts = {
		ungroupedName: 'ungrouped'
	};
	if (options) {
		for (var k in options) {
			opts[k] = options[k]
		}
	}

	var groups = {};
	var ungrouped = [];

	// Build a node for each prefix
	for (var i = 0; i < prefixes.length; i++) {
		groups[prefixes[i]] = {
			name: prefixes[i] + ' (group)',
			children: []
		}
	}

	// Go through each object, looking through each prefix
	// to see if it matches.
	for (var i = 0; i < objects.length; i++) {
		var found = false;
		for (var p = 0; p < prefixes.length; p++) {
			// We want this to be a strict prefix (eg $ won't fall under $ group)
			if (objects[i].name.length > prefixes[p].length &&
				  objects[i].name.substring(0, prefixes[p].length) == prefixes[p]) {
				groups[prefixes[p]].children.push(objects[i]);
				found = true;
				break;
			}
		}
		if (!found) {
			ungrouped.push(objects[i]);
		}
	}

	var finalGroups = [];

	// Add all groups which have at least one child
	for (var k in groups) {
		if (groups[k].children.length > 0) {
			finalGroups.push(groups[k]);
		}
	}

	// If there are no groups, we just send back the ungrouped
	if (finalGroups.length === 0) {
		return ungrouped;
	// If there is only one group and no ungrouped, just send that
	} else if (finalGroups.length == 1 && ungrouped.length == 0) {
		return finalGroups[0].children;
	}

	// In this case we have both grouped an ungrouped. Prepend the list of groups
	// with the ungrouped.
	finalGroups.unshift({
		name: opts.ungroupedName,
		children: ungrouped
	});

	return finalGroups;
};

ModelTransformer.transformDependency = function(dependency) {
	var obj = {
		name: dependency.name
	};

	obj.children = []
	var fns = dependency.functions.map(function(fn) {
		return {
			name: fn,
			children: null
		};
	});
	if (fns.length > 0) {
		obj.children.push({
			name: USED_FUNCTIONS_NAME_,
			children: fns
		})
	}

	var deps = dependency.dependencies.map(ModelTransformer.getLazyDependencyNode_);
	if (deps.length > 0) {
		obj.children.push({
			name: 'Used Libraries',
			children: deps
		})
	}

	// If there are no children, just make it null so that the node is a leaf.
	if (obj.children.length == 0) obj.children = null;

	return obj;
};

ModelTransformer.transformContext = function(context) {
	var obj = {
		name: context.name
	};
	currentContext = context.name;
	if (context.triggers.length > 0) {
		var triggers = context.triggers.map(ModelTransformer.transformTrigger);

		obj.children = [];
		obj.children.push({
			name: 'Triggers',
			children: ModelTransformer.groupByPrefix(triggers, TRIGGER_GROUPS, {
					ungroupedName: 'built-in'})
		});
		if (context.includes.length) {
			obj.children.push({
				name: 'Included App Sections',
				children: context.includes.map(function(name) {
					return {
						name: name,	
						context: name,
						loadInSelf: true
					};
				})
			});
		}
	}
	return obj;
};

ModelTransformer.transformContextWithNoGroups = function(context) {
	return {
		name: context.name,
		children: context.triggers.map(ModelTransformer.transformTrigger)
	}
};

ModelTransformer.transformTrigger = function(trigger) {
	var properties = [];

	var obj = {
		name: trigger.name
	};

	if (trigger.dom) {
		properties.push({
			key: 'type',
			value: trigger.dom.type
		});

		properties.push({
			key: 'tag',
			value: trigger.dom.tag
		})

		for (var k in trigger.dom.attributes) {
			properties.push({
				key: k,
				value: trigger.dom.attributes[k]
			})
		}

		var text = trigger.text.trim();
		if (text.length > 100) {
			text = text.substring(0, 100) + "&hellip;"
		}
		if (text.length) {
			properties.push({
				key: 'text',
				value: text
			})
		}
	}

	obj.children = trigger.sideEffects.map(ModelTransformer.transformSideEffect);
	obj.properties = properties;

	return obj;
};

ModelTransformer.getLazyDependencyNode_ = function(name, usedFunction) {
	var dependencyNode = clone(dependencyCache[name]);
	if (!dependencyNode) {
		return {
			name: name,
			dependency: name
		}
	}
	if (usedFunction && dependencyNode.children) {
		// Need to find the used functions node if there is one
		for (var i = 0; i < dependencyNode.children.length; i++) {
			if (dependencyNode.children[i].name === USED_FUNCTIONS_NAME_) {
				// If there is a list of used function, search through it for the right
				// child and set it as marked. 
				for (var j = 0; j < dependencyNode.children[i].children.length; j++) {
					if (dependencyNode.children[i].children[j].name === usedFunction) {
						dependencyNode.children[i].children[j].marked = true;
						break;
					}
				}
			}
		}
	}

	return dependencyNode;
};

ModelTransformer.transformSideEffect = function(sideEffect) {
	var properties = [];
	var children = [];

	var obj = {
		name: sideEffect.name,
	};

	for (var k in sideEffect.properties) {
		properties.push({
			key: k,
			value: sideEffect.properties[k]
		})
	}

	if (sideEffect.properties.dependency) {
		children.push(ModelTransformer.getLazyDependencyNode_(
				sideEffect.properties.dependency, 
				sideEffect.properties.call));
	}

	if (sideEffect.properties.context) {
		obj.context = sideEffect.properties.context;
	}

	if (sideEffect.properties.trigger) {
		obj.trigger = sideEffect.properties.trigger;
		obj.within = sideEffect.properties.triggerContext;
	}

	obj.properties = properties;
	obj.children = (children.length == 0) ? null : children;

	return obj;
	
}
