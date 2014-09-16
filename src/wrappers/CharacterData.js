// Copyright 2013 The Polymer Authors. All rights reserved.
// Use of this source code is goverened by a BSD-style
// license that can be found in the LICENSE file.

(function(scope) {
  'use strict';

  var copyProperty = scope.copyProperty;
  var enqueueMutation = scope.enqueueMutation;
  var mixin = scope.mixin;

  copyProperty(CharacterData, 'data', 'originalData_');
  copyProperty(CharacterData, 'data', 'textContent');

  mixin(CharacterData.prototype, {
    get data() {
      return this.originalData_;
    },
    set data(value) {
      var oldValue = this.originalData_;
      enqueueMutation(this, 'characterData', {
        oldValue: oldValue
      });
      this.originalData_ = value;
    }
  }, scope.ChildNodeInterface);

})(window.ShadowDOMPolyfill);
