var DOM = {};

/**
 * Traverses a JSON DOM tree, visiting every node.
 * @param  {Object} root The root of the JSON DOM tree.
 * @param  {function(Object):boolean} visitFn The function to visit each DOM element with.
 * 		Note that if this returns true, the traversal will finish early.
 */
DOM.traverse = function(root, visitFn) {
	var elements = [root];
	// Search until either our visit function returns true
	// or we have visited all nodes.
	while (elements.length) {
		var node = elements.pop();
		// Visit the node.
		if (visitFn(node)) break;
		// If the node has children, add them.
		if (node.children) {
			for (var i = 0; i < node.children.length; i++) {
				elements.push(node.children[i]);
			}
		}
	}
};

/**
 * Clones a copy of a DOM tree, filtering out particular nodes.
 *
 * Note: This does not check the initial root!
 * 
 * @param  {Object} root     The root of the JSON DOM tree
 * @param  {function(Object):boolean} filterFn The function to determine if a node should be included, should return
 *                                             true if a node should be kept.
 * @return {Object}          A filtered DOM tree. Note that attributes are shared, but nodes are re-created
 *                             in order to avoid modification. 
 */
DOM.filter = function(root, filterFn) {
	var newRoot = {
		type: root.type,
		tag: root.tag, 
		attributes: root.attributes,
		children: []
	}

	if (root.children) {
		for (var i = 0; i < root.children.length; i++) {
			if (filterFn(root.children[i])) {
				newRoot.children.push(DOM.filter(root.children[i], filterFn));
			}
		}
	}

	return newRoot;
};


/**
 * Safely extracts a value from a DOM node attribute if it is present. This checks for
 * the presence of a named attribute as well as its data- equivalent (eg. ng-app and 
 * data-ng-app).
 * @param  {Object} node The node.
 * @param  {string} name The name of the attribute.
 * @return {string}      The value of the attrbute if it was present, else undefined.
 */
DOM.attribute = function(node, name) {
	if (!node.attributes) {
		return undefined;
	} else {
		return node.attributes[name] || node.attributes['data-' + name];
	}
};

/**
 * Extracts the text content out of a node.
 * @param  {Object} node The HTML node to pull content from.
 * @return {string}      The text of the node.
 */
DOM.getText = function(node) {
	if (node.type == 'text') {
		return node.content;
	} else if (node.children) {
		var str = '';
		return node.children.map(DOM.getText).join(' ').trim();
	} else {
		return '';
	}
};