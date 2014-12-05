chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
	TAB_ID = message.id;
	DATA = message.data;
	sendResponse(true);
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
	if (activeInfo.tabId != TAB_ID) return;
	if (LOADED) return;

	// Only load when we actually activate the tab. This helps prevent
	// losing stack traces.
	LOADED = true;

	// Set up the search listener
	document.getElementById('search-link').addEventListener(
			'click', searchListener.bind(null, document.getElementById('search-box')));

	selectView = new SelectView('selected-view', 'selected-template');

	root = ModelTransformer.transform(DATA);
	root.x0 = HEIGHT / 2;
	root.y0 = 0;

	// Initialize the display to show a few nodes.
	root.children.forEach(toggleAll);

	// Copy into _root, which will always have the unsearched root.
	_root = root;

	update(root);
});

var TAB_ID;
var DATA;
var LOADED;
var MARGINS = [20, 120, 20, 120];
var WIDTH = 3000 - MARGINS[1] - MARGINS[3];
var HEIGHT = 800 - MARGINS[0] - MARGINS[2];
var root;
var _root;
var i = 0;

var lastSelected;
var selectView;

var tree = d3.layout.tree()
		.size([HEIGHT, WIDTH]);

var diagonal = d3.svg.diagonal()
		.projection(function(d) { return [d.y, d.x]; });

var vis = d3.select("body").append("svg:svg")
		.attr("width", WIDTH + MARGINS[1] + MARGINS[3])
		.attr("height", HEIGHT + MARGINS[0] + MARGINS[2])
		.append("svg:g")
		.attr("transform", "translate(" + MARGINS[3] + "," + MARGINS[0] + ")");

function update(source) {
	var duration = d3.event && d3.event.altKey ? 5000 : 500;

	// Compute the new tree layout.
	var nodes = tree.nodes(root).reverse();

	// Normalize for fixed-depth.
	nodes.forEach(function(d) { d.y = d.depth * 180; });

	// Update the nodes…
	var node = vis.selectAll("g.node")
			.data(nodes, function(d) { return d.id || (d.id = ++i); });

	// Enter any new nodes at the parent's previous position.
	var nodeEnter = node.enter().append("svg:g")
			.attr("class", "node")
			.attr("transform", function(d) { return "translate(" + source.y0 + "," + source.x0 + ")"; })
			.on("click", function(d) { 
				if (d3.event.ctrlKey) {

					if (lastSelected) {
						lastSelected.selected = false;
						d3.select(lastSelected).style('fill', 'black');
					}
					this.selected = true;
					lastSelected = this;
					selectView.updateSelected(d);
					d3.select(lastSelected).style('fill', 'red');
				} else {
					if (d.context) {
						if (d.loadInSelf) {
							d.children = clone(contextCache[d.context]).children;
						} else {
							d.children = [clone(contextCache[d.context])];
						}
						d.context = null;
						d.children.forEach(toggleAll);
					} else if (d.trigger) {
						// Find the node
						var context = contextCache[d.within];
						for (var i = context.children.length - 1; i >= 0; i--) {
							if (context.children[i].name == d.trigger) {
								d.children = [clone(context.children[i])];
							}
						};
						toggleAll(d.children[0]);
						d.trigger = null;
					} else if (d.dependency) {
						if (!dependencyCache[d.dependency]) {
							dependencyCache[d.dependency] = ModelTransformer.transformDependency({
								name: d.dependency
							});
						}
						var clonedDep = clone(dependencyCache[d.dependency]);
						if (clonedDep.properties) {
							d.properties = clonedDep.properties;
						}
						d.children = clonedDep.children;
						d.dependency = null;
						if (d.children && d.children.length) {
							toggleAll(d.children[0]);
						}						
					} else {
						toggle(d);
					}
					update(d); 
				}
			});

	nodeEnter.append("svg:circle")
			.attr("r", 1e-6)
			.style("fill", function(d) { return d._children || d.dependency && dependencyCache[d.dependency] && dependencyCache[d.dependency].children || d.context || d.trigger ? "lightsteelblue" : "#fff"; });

	nodeEnter.append("svg:text")
			.attr("x", function(d) { return d.context || d.trigger || d.dependency && dependencyCache[d.dependency] && dependencyCache[d.dependency].children || d.children || d._children ? -10 : 10; })
			.attr("dy", ".35em")
			.attr("text-anchor", function(d) { return d.context || d.dependency && dependencyCache[d.dependency] && dependencyCache[d.dependency].children || d.trigger || d.children || d._children ? "end" : "start"; })
			.text(function(d) { return d.name; })
			.style("fill-opacity", 1e-6)
			.attr('class', function(d) {
				if (d.isSearchResult) {
					return 'search-result';
				} else if (d.marked) {
					return 'marked';
				} else {
					return '';
				}
			});

	// Transition nodes to their new position.
	var nodeUpdate = node.transition()
			.duration(duration)
			.attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

	nodeUpdate.select("circle")
			.attr("r", 4.5)
			.style("fill", function(d) { return d._children || d.context || d.dependency && dependencyCache[d.dependency] && dependencyCache[d.dependency].children || d.trigger ? "lightsteelblue" : "#fff"; });

	nodeUpdate.select("text")
			.style("fill-opacity", 1)


	// Transition exiting nodes to the parent's new position.
	var nodeExit = node.exit().transition()
			.duration(duration)
			.attr("transform", function(d) { return "translate(" + source.y + "," + source.x + ")"; })
			.remove();

	nodeExit.select("circle")
			.attr("r", 1e-6);

	nodeExit.select("text")
			.style("fill-opacity", 1e-6);

	// Update the links…
	var link = vis.selectAll("path.link")
			.data(tree.links(nodes), function(d) { return d.target.id; });

	// Enter any new links at the parent's previous position.
	link.enter().insert("svg:path", "g")
			.attr("class", "link")
			.attr("d", function(d) {
				var o = {x: source.x0, y: source.y0};
				return diagonal({source: o, target: o});
			})
		.transition()
			.duration(duration)
			.attr("d", diagonal);

	// Transition links to their new position.
	link.transition()
			.duration(duration)
			.attr("d", diagonal);

	// Transition exiting nodes to the parent's new position.
	link.exit().transition()
			.duration(duration)
			.attr("d", function(d) {
				var o = {x: source.x, y: source.y};
				return diagonal({source: o, target: o});
			})
			.remove();

	// Stash the old positions for transition.
	nodes.forEach(function(d) {
		d.x0 = d.x;
		d.y0 = d.y;
	});
}

function toggleAll(d) {
	if (d.children) {
		d.children.forEach(toggleAll);
		toggle(d);
	}
};

function toggle(d) {
	if (d.children) {
		d._children = d.children;
		d.children = null;
	} else {
		d.children = d._children;
		d._children = null;
	}
};

function hasResult(d) {
	if (d.isSearchResult) {
		return true;
	}
	if (d.children) {
		for (var i = 0; i < d.children.length; i++) {
			if (hasResult(d.children[i])) {
				return true;
			}
		}
	}
	return false;
}

function toggleResult(d) {
	// If we are a leaf result (ie. everyone below is not a result), this is where we toggle.
	if (d.children) {
		var toggledChild = false;
	
		for (var i = 0; i < d.children.length; i++) {
			if (hasResult(d.children[i])) {
				toggledChild = true;
				toggleResult(d.children[i]);
			} else {
				toggle(d.children[i]);	
			}
		}
		if (!toggledChild) {
			toggle(d);
		}
	}
};

function searchListener(searchBox) {
	if (searchBox.value == '') {
		root = _root;
	} else {
		root = ModelSearcher.filter(searchBox.value, ModelTransformer.transform(DATA))
		root.name = 'Results';		
		root.x0 = HEIGHT / 2;
		root.y0 = 0;
		toggleResult(root);
	}
	update(root);
	return false;
};