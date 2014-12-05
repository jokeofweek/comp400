chrome.extension.onRequest.addListener(function(request, sender, callback) {
  if (request.action === 'getContent') {
    callback({
    	'src': getJSON(document),
    	'scripts': serializeScripts(),
    	'path': window.location.pathname + window.location.hash
    });
  }
});

var serializeScripts = function() {
	var scripts = [];
	for (var i = 0; i < document.scripts.length; i++) {
		var script = document.scripts[i];
		var obj = {
			'type': document.scripts[i].type,
			'url': document.scripts[i].src,
			'content': document.scripts[i].innerHTML
		};
		scripts.push(obj);
	}
	return scripts;
};

var getJSON = function(node) {
	var obj = {};

	// Element node
	if (node.nodeType == 1) {
		obj.type = 'element';
		obj.tag = node.tagName.toLowerCase();

		// Convert all children
		obj.children = [];

		var nodeChildren = node.children;
		if (nodeChildren.length == 0 && node.childNodes.length > 0) {
			nodeChildren = node.childNodes;
		}

		for (var i = 0; i < nodeChildren.length; i++) {
			var child = getJSON(nodeChildren[i]);
			if (child) {
				obj.children.push(child);
			}
		}

		// Add attributes
		obj.attributes = {};
		for (var i = 0; i < node.attributes.length; i++) {
			obj.attributes[node.attributes[i].nodeName.toLowerCase()] = node.attributes[i].value;
		}
	// Text node
	} else if (node.nodeType == 3) {
		obj.type = 'text';
		obj.content = node.value || node.textContent;
	// Document node
	} else if (node.nodeType == 9) {
		// Convert all children
		obj.type = 'document';
		obj.children = [];
		for (var i = 0; i < node.childNodes.length; i++) {
			var child = getJSON(node.childNodes[i]);
			if (child) {
				obj.children.push(child);
			}
		}
	}	else if (typeof(node) === 'string') {

	} else {
		return null;
	}

	return obj;
};	