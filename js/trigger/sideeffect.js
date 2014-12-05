Model.SideEffect = function(conditional, t) {
	this.conditional_ = !!conditional;
	this.type_ = t;
};

Model.SideEffect.prototype.isCertain = function() {
	return !this.conditional_;
};

Model.SideEffect.prototype.serialize = function() {
	return {
		name: this.type_,
		properties: {
			certain: this.isCertain()
		}
	}
};

Model.CallTriggerSideEffect = function(calledTrigger, data, conditional) {
	this.calledTrigger_ = calledTrigger;
	this.data_ = data || [];
	Model.SideEffect.call(this, conditional, 'Call Trigger');
};
Model.CallTriggerSideEffect.extend(Model.SideEffect);

Model.CallTriggerSideEffect.prototype.serialize = function() {
	var obj = Model.SideEffect.prototype.serialize.call(this);
	obj.properties.trigger = this.calledTrigger_.getName();
	obj.properties.triggerContext = this.calledTrigger_.getContext().getName();
	return obj;
};

Model.ExitApplicationSideEffect = function(trigger, link, conditional) {
	this.trigger_ = trigger;
	this.link_ = link;
	Model.SideEffect.call(this, conditional, 'Exit Application');
};
Model.ExitApplicationSideEffect.extend(Model.SideEffect);

Model.ExitApplicationSideEffect.prototype.serialize = function() {
	var obj = Model.SideEffect.prototype.serialize.call(this);
	obj.properties.link = this.link_;
	return obj;
};

Model.TransitionSideEffect = function(trigger, link, context, metadata, conditional) {
	this.trigger_ = trigger;
	this.link_ = link;
	this.context_ = context;
	this.metadata_ = metadata;
	Model.SideEffect.call(this, conditional, 'Transition');
};
Model.TransitionSideEffect.extend(Model.SideEffect);

Model.TransitionSideEffect.prototype.serialize = function() {
	var obj = Model.SideEffect.prototype.serialize.call(this);
	obj.properties.context = this.context_;
	obj.properties.metadata = JSON.stringify(this.metadata_);
	return obj;
};

Model.DependencyUseSideEffect = function(trigger, dependency, call, metadata, conditional) {
	this.trigger_ = trigger;
	this.dependency_ = dependency;
	this.call_ = call;
	this.metadata_ = metadata;
	Model.SideEffect.call(this, conditional, 'Library Use');

	// Add the exposed method to the dependency.
	this.dependency_.registerFunction(call);
};
Model.DependencyUseSideEffect.extend(Model.SideEffect);

Model.DependencyUseSideEffect.prototype.serialize = function() {
	var obj = Model.SideEffect.prototype.serialize.call(this);
	obj.properties.dependency = this.dependency_.getName();
	obj.properties.call = this.call_;
	return obj;
};