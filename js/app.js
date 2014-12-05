document.addEventListener('DOMContentLoaded', function() {
	chrome.tabs.getSelected(null, function(tab) {
		chrome.tabs.sendRequest(tab.id, {action: 'getContent'}, handleContent);
	});
});

var handleContent = function(content) {
	if (detectAngularApplication(content.src)) {
		fetchScriptContents(content).
				then(parseScripts.bind(null, content)).
				then(start.bind(null, content)).
				done();
	} else {
		alert('This is not an AngularJS application.');
	}
}

var fetchScriptContents = function(content) {
	var totalScripts = 0;
	var stepComplete = Q.defer();

	for (var i = 0; i < content.scripts.length; i++) {
		// TODO: Handle errors and propagate them through the promise.
		if (content.scripts[i].url) {
			totalScripts++;
			(function(script) {
				Qajax(script.url).
						then(Qajax.filterSuccess).
  					get("responseText").
						then(function(content) {
							script.content = content;
							totalScripts--;
							if (totalScripts === 0) {
								stepComplete.resolve();
							}
						});
			})(content.scripts[i]);	
		}
	}

	// If there are no external scripts, then automatically resolve
	if (totalScripts === 0) {
		window.setTimeout(function() {
			stepComplete.resolve();
		}, 0);
	}

	return stepComplete.promise;
};

var parseScripts = function(content) {
	var promise = Q.defer();
	window.setTimeout(function() {
		// In order to only have one AST, all scripts are merged
		// together with a semi-colon. We also validate that every
		// script was succesfully fetched.
		var scripts = [];
		for (var i = 0; i < content.scripts.length; i++) {
			var script = content.scripts[i];

			// Make sure this is actually a javascript script.
			if (script.type !== '' && script.type.toLowerCase().indexOf('javascript') === -1) {
				continue;
			}
			// Assert that each script has content.
			if (!script.content) {
				console.log('Script with no content: ' + JSON.stringify(script));
			} else {
				scripts.push(script.content);
			}
		}

		content.tree = esprima.parse(scripts.join(";\n"));
		promise.resolve();
	}, 0);
	return promise.promise;
};

var detectAngularApplication = function(root) {
	var found = false;
	DOM.traverse(root, function(node) {
		if (DOM.attribute(node, 'ng-app') || DOM.attribute(node, 'ng-controller')) {
			found = true;
			return true;
		}
	});
	return found;
};

var analyzer_ = null;

var start = function(content) {
	// Escape the promise so that we don't lose our stack trace.
	window.setTimeout(function() {
		var model = new Model(analyzeComplete);
		analyzer_ = new Analyzer(model);
		analyzer_.start(content.path, content.src, content.tree);
	}, 0);
};

var analyzeComplete = function(model) {
	var deps = [];
	for (var k in model.dependencies_) {
		deps.push({
			name: model.dependencies_[k].getName(),
			functions: model.dependencies_[k].getFunctions()
		});
	}
	var contexts = [];
	for (var key in model.contexts_) {
		var context = model.contexts_[key];
		contexts.push({
			name: context.getName(),
			hasDom: context.hasDom()
		});
	}
	
	var template = document.getElementById('deplist-template').innerHTML;
	var rendered = Mustache.render(template, {
		dependencies: deps,
		contexts: contexts
	});

	console.log('Complete: -----------');
	console.log(analyzer_);
	document.getElementById('content').innerHTML = rendered;

	chrome.tabs.create({url: 'explorer.html', active: false}, function(tab) {
		var message = {
			id: tab.id,
			data: model.serialize()
		};
		var handler = function(response) {
			if (!response) {
				chrome.tabs.sendMessage(tab.id, message, handler);
			} else {
				console.log("Sent model: ");
				console.log(message);
			}
		};
		// Send model until the tab responds.
		chrome.tabs.sendMessage(tab.id, message, handler);
	});

};