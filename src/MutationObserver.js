/*
 * Copyright 2013 The Polymer Authors. All rights reserved.
 * Use of this source code is goverened by a BSD-style
 * license that can be found in the LICENSE file.
 */

(function(scope) {
  'use strict';

  var setEndOfMicrotask = scope.setEndOfMicrotask
  var wrappers = scope.wrappers;

  var registrationsTable = new WeakMap();
  var globalMutationObservers = [];
  var isScheduled = false;

  function scheduleCallback() {
    if (isScheduled)
      return;
    setEndOfMicrotask(notifyObservers);
    isScheduled = true;
  }

  // http://dom.spec.whatwg.org/#mutation-observers
  function notifyObservers() {
    isScheduled = false;

    while (globalMutationObservers.length) {
      var notifyList = globalMutationObservers;
      globalMutationObservers = [];

      // Deliver changes in birth order of the MutationObservers.
      notifyList.sort(function(x, y) { return x.uid_ - y.uid_; });

      for (var i = 0; i < notifyList.length; i++) {
        var mo = notifyList[i];
        var queue = mo.takeRecords();
        removeTransientObserversFor(mo);
        if (queue.length) {
          mo.callback_(queue, mo);
        }
      }
    }
  }


  /**
   * @param {string} type
   * @param {Node} target
   * @constructor
   */
  function MutationRecord(type, target, data, includeOldValue) {
    // TODO(jmesserly): users should not be able to call this constructor.
    this.type = type;
    this.target = target;

    if ('name' in data && 'namespace' in data) {
      this.attributeName = data.name;
      this.attributeNamespace = data.namespace;
    } else {
      this.attributeName = null;
      this.attributeNamespace = null;
    }

    var added = data.addedNodes;
    this.addedNodes = added ? added : new wrappers.NodeList();

    var removed = data.removedNodes;
    this.removedNodes = removed ? removed : new wrappers.NodeList();

    var previous = data.previousSibling;
    this.previousSibling = previous ? previous : null;

    var next = data.nextSibling;
    this.nextSibling = next ? next : null;

    this.oldValue = includeOldValue ? data.oldValue : null;
  }

  /**
   * Registers transient observers to ancestor and its ancesors for the node
   * which was removed.
   * @param {!Node} ancestor
   * @param {!Node} node
   */
  function registerTransientObservers(ancestor, node) {
    for (; ancestor; ancestor = ancestor.parentNode) {
      var registrations = registrationsTable.get(ancestor);
      if (!registrations)
        continue;
      for (var i = 0; i < registrations.length; i++) {
        var registration = registrations[i];
        if (registration.options.subtree)
          registration.addTransientObserver(node);
      }
    }
  }

  function removeTransientObserversFor(observer) {
    for (var i = 0; i < observer.nodes_.length; i++) {
      var node = observer.nodes_[i];
      var registrations = registrationsTable.get(node);
      if (!registrations)
        return;
      for (var j = 0; j < registrations.length; j++) {
        var registration = registrations[j];
        if (registration.observer === observer)
          registration.removeTransientObservers();
      }
    }
  }

  function getAllRegistrations(node) {
    var result = registrationsCache.get(node);
    if (result !== undefined)
      return result;

    var selfRegistrations = registrationsTable.get(node);

    var parent = node.parentNode;
    var parentRegistrations = parent ? getAllRegistrations(parent) : null;

    // TODO(jmesserly): there's no need to return parentNode observer
    // registrations that don't listen on subtrees. We could filter those
    // out point.

    // It's important not to mutate selfRegistrations or parentRegistrations
    // here, as that's from registrationsTable which is the actual source of
    // truth about what the real registrations are for a given node.
    if (selfRegistrations) {
      result = selfRegistrations;
      if (parentRegistrations) {
        result = result.concat(parentRegistrations);
      }
    } else {
      result = parentRegistrations;
    }

    registrationsCache.set(node, result);
    return result;
  }

  function clearObserverRegistrations(node) {
    if (registrationsCache.has(node)) {
      registrationsCache.delete(node);

      for (var child = node.firstChild; child; child = child.nextSibling) {
        clearObserverRegistrations(child);
      }
    }
  }

  // This is invalidated when a new observer changes, or when a node with
  // cached information is removed from the tree. The goal is to speed up
  // typical tree construction by providing an O(1) lookup of observers, without
  // slowing down either insert or removal by pushing around observer info.
  var registrationsCache = new WeakMap();

  // http://dom.spec.whatwg.org/#queue-a-mutation-record
  function enqueueMutation(target, type, data) {
    // The implementation here has some optimizations which aren't described in
    // the line-by-line reading of the spec. It should still implement the
    // specified behavior, though.

    var interestedObservers;
    var observeOldValue;

    var registrations = getAllRegistrations(target);
    if (!registrations)
      return;

    for (var i = 0; i < registrations.length; i++) {
      var registration = registrations[i];
      var options = registration.options;

      if (!options.subtree && target !== registration.target)
        continue;

      if (type === 'childList' && !options.childList)
        continue;

      if (type === 'characterData' && !options.characterData)
        continue;

      if (type === 'attributes') {
        if (!options.attributes)
          continue;
        // If type is "attributes", options's attributeFilter is present,
        // and either options's attributeFilter does not contain name or
        // namespace is non-null, continue.
        if (options.attributeFilter &&
            (data.namespace !== null ||
             options.attributeFilter.indexOf(data.name) === -1)) {
          continue;
        }
      }

      var observer = registration.observer;
      if (!interestedObservers) {
        interestedObservers = Object.create(null);
      }
      interestedObservers[observer.uid_] = observer;

      // If either type is "attributes" and options's attributeOldValue is
      // true, or type is "characterData" and options's characterDataOldValue
      // is true, set the paired string of registered observer's observer in
      // interested observers to oldValue.
      if (type === 'attributes' && options.attributeOldValue ||
          type === 'characterData' && options.characterDataOldValue) {
        if (!observeOldValue) {
          observeOldValue = Object.create(null);
        }
        observeOldValue[observer.uid_] = true;
      }
    }

    var anyObserversEnqueued = false;
    var sharedRecord;
    var oldValueRecord;

    if (!interestedObservers)
      return;

    for (var uid in interestedObservers) {
      var observer = interestedObservers[uid];

      // We reuse record instances. Blink does this optimization too.
      // TODO(jmesserly): ideally ours would be immutable too.
      var record;
      if (observeOldValue && observeOldValue[uid]) {
        if (!oldValueRecord) {
          oldValueRecord = new MutationRecord(type, target, data, true);
        }
        record = oldValueRecord;
      } else {
        if (!sharedRecord) {
          sharedRecord = new MutationRecord(type, target, data, false);
        }
        record = sharedRecord;
      }

      var records = observer.records_;
      if (!records.length) {
        globalMutationObservers.push(observer);
        anyObserversEnqueued = true;
      }

      records.push(record);
    }

    if (anyObserversEnqueued)
      scheduleCallback();
  }

  var slice = Array.prototype.slice;

  /**
   * @param {!Object} options
   * @constructor
   */
  function MutationObserverOptions(options) {
    this.childList = !!options.childList;
    this.subtree = !!options.subtree;

    // 1. If either options' attributeOldValue or attributeFilter is present
    // and options' attributes is omitted, set options' attributes to true.
    if (!('attributes' in options) &&
        ('attributeOldValue' in options || 'attributeFilter' in options)) {
      this.attributes = true;
    } else {
      this.attributes = !!options.attributes;
    }

    // 2. If options' characterDataOldValue is present and options'
    // characterData is omitted, set options' characterData to true.
    if ('characterDataOldValue' in options && !('characterData' in options))
      this.characterData = true;
    else
      this.characterData = !!options.characterData;

    // 3. & 4.
    if (!this.attributes &&
        (options.attributeOldValue || 'attributeFilter' in options) ||
        // 5.
        !this.characterData && options.characterDataOldValue) {
      throw new TypeError();
    }

    this.characterData = !!options.characterData;
    this.attributeOldValue = !!options.attributeOldValue;
    this.characterDataOldValue = !!options.characterDataOldValue;
    if ('attributeFilter' in options) {
      if (options.attributeFilter == null ||
          typeof options.attributeFilter !== 'object') {
        throw new TypeError();
      }
      this.attributeFilter = slice.call(options.attributeFilter);
    } else {
      this.attributeFilter = null;
    }
  }

  var uidCounter = 0;

  /**
   * The class that maps to the DOM MutationObserver interface.
   * @param {Function} callback.
   * @constructor
   */
  function MutationObserver(callback) {
    this.callback_ = callback;
    this.nodes_ = [];
    this.records_ = [];
    this.uid_ = ++uidCounter;
  }

  MutationObserver.prototype = {
    constructor: MutationObserver,

    // http://dom.spec.whatwg.org/#dom-mutationobserver-observe
    observe: function(target, options) {
      var newOptions = new MutationObserverOptions(options);

      // 6.
      var registration;
      var registrations = registrationsTable.get(target);
      if (!registrations)
        registrationsTable.set(target, registrations = []);

      for (var i = 0; i < registrations.length; i++) {
        if (registrations[i].observer === this) {
          registration = registrations[i];
          // 6.1.
          registration.removeTransientObservers();
          // 6.2.
          registration.options = newOptions;
          // Each node can only have one registered observer associated with
          // this observer.
          break;
        }
      }

      // 7.
      if (!registration) {
        // Adding an observer invalidates the cache
        // TODO(jmesserly): we should only need to clear the subtree of target
        // if either the new or old registration had a subtree.
        clearObserverRegistrations(target);

        registration = new Registration(this, target, newOptions);
        registrations.push(registration);
        this.nodes_.push(target);
      }
    },

    // http://dom.spec.whatwg.org/#dom-mutationobserver-disconnect
    disconnect: function() {
      this.nodes_.forEach(function(node) {
        var registrations = registrationsTable.get(node);
        for (var i = 0; i < registrations.length; i++) {
          var registration = registrations[i];
          if (registration.observer === this) {
            registrations.splice(i, 1);
            // Each node can only have one registered observer associated with
            // this observer.
            break;
          }
        }
      }, this);
      this.records_ = [];
    },

    takeRecords: function() {
      var copyOfRecords = this.records_;
      this.records_ = [];
      return copyOfRecords;
    }
  };

  /**
   * Class used to represent a registered observer.
   * @param {MutationObserver} observer
   * @param {Node} target
   * @param {MutationObserverOptions} options
   * @constructor
   */
  function Registration(observer, target, options) {
    this.observer = observer;
    this.target = target;
    this.options = options;
    this.transientObservedNodes = [];
  }

  Registration.prototype = {
    /**
     * Adds a transient observer on node. The transient observer gets removed
     * next time we deliver the change records.
     * @param {Node} node
     */
    addTransientObserver: function(node) {
      // Don't add transient observers on the target itself. We already have all
      // the required listeners set up on the target.
      if (node === this.target)
        return;

      this.transientObservedNodes.push(node);
      var registrations = registrationsTable.get(node);
      if (!registrations)
        registrationsTable.set(node, registrations = []);

      // We know that registrations does not contain this because we already
      // checked if node === this.target.
      registrations.push(this);

      clearObserverRegistrations(node);
    },

    removeTransientObservers: function() {
      var transientObservedNodes = this.transientObservedNodes;
      this.transientObservedNodes = [];

      for (var i = 0; i < transientObservedNodes.length; i++) {
        var node = transientObservedNodes[i];
        var registrations = registrationsTable.get(node);
        for (var j = 0; j < registrations.length; j++) {
          if (registrations[j] === this) {
            registrations.splice(j, 1);
            // Each node can only have one registered observer associated with
            // this observer.
            break;
          }
        }
      }
    }
  };

  window.MutationObserver = MutationObserver;

  scope.clearObserverRegistrations = clearObserverRegistrations;
  scope.enqueueMutation = enqueueMutation;
  scope.registerTransientObservers = registerTransientObservers;
  scope.wrappers.MutationObserver = MutationObserver;
  scope.wrappers.MutationRecord = MutationRecord;

})(window.ShadowDOMPolyfill);
