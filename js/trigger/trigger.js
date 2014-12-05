Model.Trigger = function(name) {
	this.name_ = name;
	this.context_ = null;
	this.metadata_ = [];
	this.sideEffects_ = [];
};

Model.Trigger.prototype.setMetadata = function(metadata) {
	this.metadata_ = metadata;
};

Model.Trigger.prototype.setContext = function(context) {
	this.context_ = context;
};

Model.Trigger.prototype.getContext = function() {
	return this.context_;
};

Model.Trigger.prototype.getName = function() {
	return this.name_;
};

Model.Trigger.prototype.addSideEffect = function(sideEffect) {
	this.sideEffects_.push(sideEffect);
};

Model.Trigger.prototype.serialize = function() {
	return {
		name: this.name_,
		sideEffects: this.sideEffects_.map(function(effect) {
			return effect.serialize();
		})
	};
};

Model.DOMTrigger = function(name, node) {
	this.node_ = node;
	Model.Trigger.call(this, name);
};
Model.DOMTrigger.extend(Model.Trigger);

Model.DOMTrigger.prototype.serialize = function() {
	var obj = Model.Trigger.prototype.serialize.call(this);

	obj.text = DOM.getText(this.node_);
	obj.dom = DOM.filter(this.node_, function(){return false;});
	
	return obj;
};