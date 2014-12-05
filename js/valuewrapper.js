function ValueWrapper(value, conditional) {
	this.value_ = value;	
	this.certain_ = conditional ? ValueWrapper.POSSIBLY : ValueWrapper.CERTAIN;
};

ValueWrapper.CERTAIN = 1;
ValueWrapper.POSSIBLY = 2;

/**
 * Helper method to get the highest certainty given two. Note that CERTAIN
 * is returned if and only if both are certain.
 * @param  {number} c1 
 * @param  {number} c2 
 * @return {number}    The highest certainty that c1 and c2 agree on.
 */
ValueWrapper.maxCertainty = function(c1, c2) {
	if (c1 === ValueWrapper.CERTAIN && c1 === c2) {
		return ValueWrapper.CERTAIN;
	} else {
		return ValueWrapper.POSSIBLY;
	}
}

/**
 * Obtains the possible version of this ValueWrapper.
 * If it is already possible, it is simply returned. If not,
 * a copy is made which is possible instead of certain.
 * @return {ValueWrapper} The ValueWrapper with the same value
 *                            as this but with the certainty set
 *                            to possible.
 */
ValueWrapper.prototype.possibly = function() {
	if (this.certain_ === ValueWrapper.CERTAIN) {
		return new ValueWrapper(this.value_, true);
	} else {
		return this;
	}
};

ValueWrapper.prototype.isCertain = function() {
	return this.certain_ == ValueWrapper.CERTAIN;
};

ValueWrapper.prototype.getCertainty = function() {
	return this.certain_;
};

ValueWrapper.prototype.getValue = function() {
	return this.value_;
};

ValueWrapper.getRootValues = function(varName, mapping) {
	var marked = {};
	
	// We process all possible variables. In order to add the root values
	// for a variable, we need to also record its certainty.
	var toProcess = [[varName, ValueWrapper.CERTAIN]];

	// Keep track of both identifiers, mapping the variable name to the
	// certainty. We initially add this variable's identifier to the mapping.
	var identifiers = {};
	identifiers[varName] = ValueWrapper.CERTAIN;

	while (toProcess.length > 0) {
		// For each variable, look up its values in the mapping.
		// If a value is a variable or identifier we keep it.
		var current = toProcess.pop();
		marked[current[0]] = true;
		var values = mapping[current[0]];
		if (!values) continue;

		for (var i = 0; i < values.length; i++) {
			var newVal = values[i].getValue();
			if (newVal.type === Types.IDENTIFIER) {
				// If a value is an identifier, add it to the list with
				// the certainty.
				var newCert = ValueWrapper.maxCertainty(values[i]	.getCertainty(), current[1]);
				identifiers[newVal.name] = newCert;
				if (!marked[newVal.name]) {
					toProcess.push([newVal.name, newCert]);
				}
			}
		}
	}

	return identifiers;
};
