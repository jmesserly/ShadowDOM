// Copyright 2013 The Polymer Authors. All rights reserved.
// Use of this source code is goverened by a BSD-style
// license that can be found in the LICENSE file.

(function(scope) {
  'use strict';

  var TreeScope = scope.TreeScope;
  var elementFromPoint = scope.elementFromPoint;
  var getInnerHTML = scope.getInnerHTML;
  var getTreeScope = scope.getTreeScope;
  var mixin = scope.mixin;
  var setInnerHTML = scope.setInnerHTML;

  var shadowHostTable = new WeakMap();
  var nextOlderShadowTreeTable = new WeakMap();

  var spaceCharRe = /[ \t\n\r\f]/;

  function createShadowRoot(host) {
    var self = host.ownerDocument.createDocumentFragment();
    // TODO(jmesserly): can we avoid setting proto here? Should we just leave
    // ShadowRoot as a wrapper around a DocumentFragment?
    self.__proto__ = ShadowRoot.prototype;

    var oldShadowRoot = host.shadowRoot;
    nextOlderShadowTreeTable.set(self, oldShadowRoot);

    self.treeScope_ = new TreeScope(self, getTreeScope(oldShadowRoot || host));

    shadowHostTable.set(self, host);
    return self;
  }

  function ShadowRoot() {
    throw TypeError('illegal constructor');
  }
  ShadowRoot.prototype = Object.create(DocumentFragment.prototype);
  mixin(ShadowRoot.prototype, {
    constructor: ShadowRoot,

    get innerHTML() {
      return getInnerHTML(this);
    },
    set innerHTML(value) {
      setInnerHTML(this, value);
      this.invalidateShadowRenderer_();
    },

    get olderShadowRoot() {
      return nextOlderShadowTreeTable.get(this) || null;
    },

    get host() {
      return shadowHostTable.get(this) || null;
    },

    elementFromPoint: function(x, y) {
      return elementFromPoint(this, this.ownerDocument, x, y);
    },

    getElementById: function(id) {
      if (spaceCharRe.test(id))
        return null;
      return this.querySelector('[id="' + id + '"]');
    }
  });

  scope.createShadowRoot = createShadowRoot;
  scope.ShadowRoot = ShadowRoot;
  window.ShadowRoot = ShadowRoot;

})(window.ShadowDOMPolyfill);
