function Model(completeCallback) {
	this.dependencies_ = {};
	this.contexts_ = {};
	this.completeCallback_ = completeCallback;
};

Model.prototype.registerDependency = function(name) {
	// Only create the dependency if it doesn't already exist.
	var dep = this.dependencies_[name];
	if (!dep) {
		dep = this.dependencies_[name] = new Model.Dependency(name);
	}
	return dep;
};

Model.prototype.findDependency = function(name) {
	return this.dependencies_[name];
};

Model.prototype.registerContext = function(context) {
	this.contexts_[context.getName()] = context;
};

Model.prototype.getContext = function(name) {
	return this.contexts_[name];
};

Model.prototype.getContexts = function() {
	return Object.keys(this.contexts_);
};

Model.prototype.done = function() {
	this.completeCallback_(this);
};

Model.prototype.serialize = function() {
	var serializedDeps = [];
	for (var k in this.dependencies_) {
		serializedDeps.push(this.dependencies_[k].serialize());
	}

	var serializedContexts = [];
	for (var k in this.contexts_) {
		serializedContexts.push(this.contexts_[k].serialize());
	}

	return {
		dependencies: serializedDeps,
		contexts: serializedContexts
	}
};

Model.Dependency = function(name) {
	this.name_ = name;
	this.functions_ = {};
	/** 
	 * The name of the dependencies used by this dependency. 
	 * Note the keys are strings, and not the dependency itself.
	 * @type {Object}
	 */
	this.dependencies_ = {};
};

Model.Dependency.prototype.getName = function() {
	return this.name_;
};

Model.Dependency.prototype.registerFunction = function(name) {
	// If the dependency itself is called (ie. dependency is a function)
	// then the function won't have a name. In this case, we use the name of
	// the dependency itself.
	if (name == '') {
		name = this.name_;
	}
	this.functions_[name] = true;
};

Model.Dependency.prototype.registerDependency = function(name) {
	this.dependencies_[name] = true;
};

Model.Dependency.prototype.getFunctions = function() {
	return Object.keys(this.functions_);
};

Model.Dependency.prototype.getDependencies = function() {
	return Object.keys(this.dependencies_);
};

Model.Dependency.prototype.serialize = function() {
	return {
		name: this.name_,
		functions: this.getFunctions(),
		dependencies: this.getDependencies()
	}
};

Model.Context = function(name, dom) {
	this.name_ = name;
	this.dom_ = dom;
	this.triggers_ = {};
	this.includedContexts_ = {};
};

Model.Context.prototype.getName = function() {
	return this.name_;
};

Model.Context.prototype.hasDom = function() {
	return !!this.dom_;
};

Model.Context.prototype.setDom = function(dom) {
	this.dom_ = dom;
};

Model.Context.prototype.registerTrigger = function(trigger) {
	this.triggers_[trigger.getName()] = trigger;
	trigger.setContext(this);
};

Model.Context.prototype.findTrigger = function(name) {
	return this.triggers_[name];
};

Model.Context.prototype.addIncludedContext = function(name) {
	this.includedContexts_[name] = true;
};

Model.Context.prototype.serialize = function() {
	var serializedTriggers = [];
	for (var k in this.triggers_) {
		serializedTriggers.push(this.triggers_[k].serialize());
	}

	return {
		name: this.name_,
		triggers: serializedTriggers,
		includes: Object.keys(this.includedContexts_)
	};
};