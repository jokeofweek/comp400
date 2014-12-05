Function.prototype.extend=function(a){this.prototype=Object.create(a.prototype);this.prototype.constructor=this;return this};

function IDProvider(prefix) {
	this.prefix_ = prefix;
	this.next_ = 0;
};

IDProvider.prototype.get = function() {
	return this.prefix_ + (++this.next_);
};

DOMIdGenerator = new IDProvider('dom');

function clone(obj) {
    if(obj == null || typeof(obj) != 'object')
        return obj;

    var temp = obj.constructor(); // changed

    for(var key in obj) {
        if(obj.hasOwnProperty(key)) {
            temp[key] = clone(obj[key]);
        }
    }
    return temp;
}