function getJSON(node) {
	var obj = {};

	if (node.nodeType == 1) {
		// Element
		obj.type = 'element';
		obj.tag = node.tagName.toLowerCase();

		// Convert all children
		obj.children = [];
		for (var i = 0; i < node.childNodes.length; i++) {
			var child = getJSON(node.childNodes[i]);
			if (child) {
				obj.children.push(child);
			}
		}

		// Add attributes
		obj.attributes = {};
		for (var i = 0; i < node.attributes.length; i++) {
			obj.attributes[node.attributes[i].nodeName] = node.attributes[i].value;
		}
	} else if (node.nodeType == 3) {
		obj.type = 'text';
		obj.content = node.value || node.nodeValue;
	} else {
		// Unsupported type
		return null;
	}	

	return obj;
}