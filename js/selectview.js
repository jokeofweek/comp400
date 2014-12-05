function SelectView(id, templateId) {
	this.dom_ = document.getElementById(id);
	this.template_ = document.getElementById(templateId).innerHTML;

	this.updateSelected(null);
};

SelectView.prototype.updateSelected = function(obj) {
	if (obj) {
		this.formatDom_(obj);
	}
};

SelectView.prototype.formatDom_ = function(obj) {
	console.log(obj);
	var rendered = Mustache.render(this.template_, {
		name: obj.name,
		properties: obj.properties || []
	});
	this.dom_.innerHTML = rendered;
};