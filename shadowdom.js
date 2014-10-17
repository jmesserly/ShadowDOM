// Copyright 2013 The Polymer Authors. All rights reserved.
// Use of this source code is goverened by a BSD-style
// license that can be found in the LICENSE file.

(function() {
  var thisFile = 'shadowdom.js';
  var base = '';
  Array.prototype.forEach.call(document.querySelectorAll('script[src]'), function(s) {
    var src = s.getAttribute('src');
    var re = new RegExp(thisFile + '[^\\\\]*');
    var match = src.match(re);
    if (match) {
      base = src.slice(0, -match[0].length);
    }
  });

  [
    "dom-accessors/src/dom-accessors.js",
    "../observe-js/src/observe.js",
    "../WeakMap/weakmap.js",
    "src/wrappers.js",
    "src/microtask.js",
    "src/wrappers/events.js",
    "src/wrappers/NodeList.js",
    "src/wrappers/HTMLCollection.js",
    "src/wrappers/Node.js",
    "src/querySelector.js",
    "src/wrappers/node-interfaces.js",
    "src/wrappers/CharacterData.js",
    "src/wrappers/Text.js",
    "src/wrappers/DOMTokenList.js",
    "src/wrappers/Element.js",
    "src/wrappers/HTMLElement.js",
    "src/wrappers/HTMLContentElement.js",
    "src/wrappers/generic.js",
    "src/wrappers/ShadowRoot.js",
    "src/ShadowRenderer.js",
    "src/wrappers/Document.js",
    "src/wrappers/Window.js",
  ].forEach(function(src) {
    document.write('<script src="' + base + src + '"></script>');
  });

})();
