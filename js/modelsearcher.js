ModelSearcher = {};

ModelSearcher.markAndFindPath_ = function(query, destroy, node) {
	var found = false;
	if (ModelSearcher.matchesQuery_(query, node)) {
		found = true;
		node.isSearchResult = true;
	}
	// If we didn't find any at this spot, and we are destroying,
	// eliminate all children with no path.
	if (node.children) {
		if (destroy && !found) {
			node.children = node.children.filter(ModelSearcher.markAndFindPath_.bind(null, query, destroy));
			if (node.children.length > 0) {
				found = true;
			}
		} else {
			// If we found or we aren't destroying, simply map over all children to ensure the
			// right children get marked.
			node.children.map(ModelSearcher.markAndFindPath_.bind(null, query, false));
		}
	}

	return found;
};

ModelSearcher.filter = function(query, root) {
	query = query.toLowerCase();

	var filtered = clone(root);
	ModelSearcher.markAndFindPath_(query, true, filtered);

	return filtered;
};

ModelSearcher.matchesQuery_ = function(query, node) {
	// Check if the query is in the name.
	if (node.name.toLowerCase().indexOf(query) != -1) return true;

	// Check if any of the properties contain this value.
	if (node.properties) {
		for (var i = node.properties.length - 1; i >= 0; i--) {
			if (node.properties[i].value.toString().toLowerCase().indexOf(query) != -1) return true;
		};
	}

	return false;
};