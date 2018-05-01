import React from 'react';
import ReactDOM from 'react-dom';
import Editor from '../scripts/editor';

/*global H5PEditor, H5P*/
H5PEditor.widgets.branchingScenario = H5PEditor.BranchingScenario = (function ($) {
  /**
   * Initialize Branching Scenario editor.
   *
   * @class H5PEditor.BranchingScenario
   * @param {Object} parent - Parent.
   * @param {Object} field - Contents.
   * @param {Object} params - Params.
   * @param {function} setValue - Callback.
   */
  function BranchingScenarioEditor(parent, field, params, setValue) {
    this.parent = parent;
    // Fields of semantics
    this.field = field;

    let elementFields = this.findField('content', this.field.fields);
    this.libraries = this.findField('content', elementFields.field.fields).options;

    this.params = params || {};
    setValue(field, this.params);

    this.translations = [];

    /**
     * Get all the machine names of libraries used in params.
     *
     * Will recursively look for "library" property and return Array of contents.
     * Could well be generalized and become a filter function.
     *
     * Does NOT yet meet the design requirements! Needs nested libraries for
     * subcontent.
     *
     * @param {object} [params] - Parameters.
     * @return {object[]} Array of machine names of libraries used.
     */
    const getLibraryNames = function (params = {}, results = []) {
      if (!Array.isArray(results) || results.some(result => typeof result !== 'string')) {
        return [];
      }

      Object.entries(params).forEach(entry => {
        // Library string
        if (entry[0] === 'library' && typeof entry[1] === 'string' && results.indexOf(entry[1]) === -1) {
          results.push(entry[1]);
        }
        // JSON content
        if (typeof entry[1] === 'object' && !Array.isArray(entry[1])) {
          return getLibraryNames(entry[1], results);
        }
        // Array content
        if (typeof entry[1] === 'object' && Array.isArray(entry[1])) {
          entry[1].forEach(item => {
            return getLibraryNames(item, results);
          });
        }
      });

      return results;
    };

    /**
     * Flatten semantics.
     * Unsanitized. Will keep track of the old path, so it can be "reverted" later.
     *
     * @param {object} field - Semantics field to start with flattening.
     * @param {object[]} [path] - Start path to be added.
     * @return {object[]} Flattened semantics.
     */
    const flattenSemantics = function(field, path = []) {
      if (!Array.isArray(field)) {
        field = [field];
      }

      let results = [];
      const currentPath = path.slice();

      field
        .filter(field => field !== undefined)
        .forEach(field => {
          const nextPathItem = field.name ? [field.name] : [];
          field.path = currentPath;
          results.push(field);
          if (field.type === 'group') {
            results = results.concat(flattenSemantics(field.fields, currentPath.concat(nextPathItem)));
          }
          if (field.type === 'list') {
            results = results.concat(flattenSemantics(field.field.fields, currentPath.concat(nextPathItem).concat([field.field.name])));
          }
        });

      return results;
    };

    /**
     * Check if field properties match a filter in a given way.
     *
     * @param {object} field - Semantics field.
     * @param {object} filter - Filter.
     * @param {string} filter.property - Field property to compare with.
     * @param {number|string|boolean} filter.value - Property value to compare with.
     * @param {string} filter.mode - Comparator between properties, e.g. "===" or "!==".
     * @return {boolean} True, if property matches value given the mode.
     */
    const fieldMatchesFilter = function(field, filter) {
      if (!field || !filter || typeof filter.value === 'undefined') {
        return false;
      }

      if (!filter.mode) {
        filter.mode = '===';
      }

      // More comparators could be added
      switch (filter.mode) {
        case '===':
          return (field[filter.property] === filter.value);
        case '!==':
          return (field[filter.property] !== filter.value);
      }

      return false;
    };

    /**
     * Check if particular comnbination of property filters is given.
     *
     * @param {object} field - Semantics field.
     * @param {object[]} filters - List of filters.
     * @param {string} filters[].property - Field property to compare with.
     * @param {number|string|boolean} filters[].value - Property value to compare with.
     * @param {string} filters[].[mode] - Comparator between properties, e.g. "===" (default) or "!==".
     * @param {string} [mode] - Comparator between filters, e.g. "||" (default) or "&&".
     * @return {boolean} True, if property combination matches mode.
     */
    const andOrOr = function (field, filters = {}, mode = '||') {
      if (!field) {
        return false;
      }

      switch (mode) {
        case '||':
          return filters.some(filter => fieldMatchesFilter(field, filter));
        case '&&':
          return filters.every(filter => fieldMatchesFilter(field, filter));
      }

      return false;
    };

    /**
     * Filter semantics for particular property combinations.
     *
     * @param {object} field - Semantics field.
     * @param {object[]} filters - List of filters.
     * @param {string} filters[].property - Field property to compare with.
     * @param {number|string|boolean} filters[].value - Property value to compare with.
     * @param {string} filters[].[mode] - Comparator between properties, e.g. "===" (default) or "!==".
     * @param {string} [mode] - Comparator between filters, e.g. "||" (default) or "&&".
     */
    const filterSemantics = function (field, filters = [], mode = '||') {
      if (!Array.isArray(filters)) {
        filters = [filters];
      }

      const flatSemantics = flattenSemantics(field);
      return flatSemantics.filter(semantic => andOrOr(semantic, filters, mode));
    };

    /**
     * Filter params for a particular keys and return string values.
     * Can fail if there are multiple duplicate property names. It'd be better
     * to synchronize parsing params with semantics in order to get the
     * correct field.
     *
     * @param {object} params - Parameters to check.
     * @param {string} key - Property to look for.
     * @return {object[]} Values found for key.
     */
    const guessTranslationTexts = function (params, key) {
      if (typeof params !== 'object') {
        return;
      }
      if (typeof key !== 'string') {
        return;
      }

      let results = [];

      for (let param in params) {
        if (typeof params[param] === 'object') {
          results = results.concat(guessTranslationTexts(params[param], key));
        }
        if (param === key && typeof params[param] === 'string') {
          results.push(params[param]);
        }
      }
      return results;
    };

    /*
     * This is terribly slow! Maybe it's better to pull the common semantics fields from somewhere else?
     * Also: IE 11 doesn't support promises (and async/await) and'd need a Polyfill or an oldfashioned
     * solution.
     */
    const promise = new Promise(resolve => {
      const libraryNames = getLibraryNames(this.params, [parent.currentLibrary]);

      const allSemantics = [];
      libraryNames.forEach(libraryName => {
        H5PEditor.loadLibrary(libraryName, result => {
          allSemantics.push({library: libraryName, semantics: {
            type: 'group',
            fields: result
          }});
          if (allSemantics.length === libraryNames.length) {
            resolve(allSemantics);
          }
        });
      });
    });
    promise.then((results) => {
      results.forEach(result => {
        // Can contain "common" group fields with further "common" text fields nested inside
        const firstFilter = filterSemantics(result.semantics, {property: 'common', value: true});
        const currentLibrary = this.getSubParams(this.params, result.library) || this.params;
        const fields = filterSemantics(firstFilter, {property: 'type', value: 'text'});
        fields.forEach(field => {
          field.translation = guessTranslationTexts(currentLibrary, field.name)[0];
          field.library = result.library;
        });

        // Flatten out the firstFilter to get a plain structure if there was a group in between
        if (fields.length > 0) {
          this.translations.push(fields);
        }
      });
      /*
       * this.translations now contains all translatable fields as
       *
       * [
       *   {
       *     fields: [
       *       {name: ..., library: ..., translation: ...},
       *       {name: ..., library: ..., translation: ...}
       *     ]
       *   }
       * ]
       *
       * BUT the procedure can be slow and delay populating the translation fields.
       * There must be a smarter way (in core) -- at least when replacing the old editor!
       */

      // Update ReactDOM
      if (this.editor) {
        this.editor.update({translations: this.translations});
      }
    });


    // TODO: Match semantics with design
    // TODO: Sanitized access more elegantly
    this.params.startScreen = this.params.startScreen || {};
    this.params.startScreen.startScreenTitle = this.params.startScreen.startScreenTitle || '';
    this.params.startScreen.startScreenSubtitle = this.params.startScreen.startScreenSubtitle || '';
    this.params.endScreens = this.params.endScreens || [{}];

    this.settings = {
      startTitle: this.params.startScreen.startScreenTitle,
      startSubtitle: this.params.startScreen.startScreenSubtitle,
      startImage: this.params.startScreen.startScreenImage,
      endScore: 0, // TODO: Doesn't have a match in current semantics
      endFeedback: '', // TODO: Doesn't have a match in current semantics
      endImage: this.params.endScreens[0].endScreenImage,
      optionsSkipToAQuestion: false, // TODO: Doesn't have a match in current semantics
      optionsConfirmOnAlternative: false, // TODO: Doesn't have a match in current semantics
      optionsTryAnotherChoice: false, // TODO: Doesn't have a match in current semantics
      optionsDisplayScore: false // TODO: Doesn't have a match in current semantics
    };

    this.passReadies = true;
    parent.ready(() => this.passReadies = false);

    // TODO: Make a general function for retrieving particular fields from semantics
    const field1 = this.field.fields[1].fields[2];
    this.startImageChooser = new H5PEditor.widgets.image(this, field1, this.settings.startImage, () => {});

    const field2 = this.field.fields[2].field.fields[2];
    this.endImageChooser = new H5PEditor.widgets.image(this, field2, this.settings.endImage, () => {});
  }

  /**
   * Update parameters with values delivered by React components.
   *
   * @param {Object} data - Data from React components.
   */
  BranchingScenarioEditor.prototype.updateParams = function (data) {
    // TODO: Switch here if we accept data from more than one component
    this.params.startScreen.startScreenTitle = data.startTitle;
    this.params.startScreen.startScreenSubtitle = data.startSubtitle;
    this.params.startScreen.startScreenImage = data.startImage;
    this.params.endScreens[0].endScreenImage = data.endImage;
  };

  /**
   * Update translations
   *
   * @param {Object} data - Data from React components.
   */
  BranchingScenarioEditor.prototype.updateTranslations = function (data) {
    // ;-)
    const weNeedToDigDeeper = function (root, path) {
      if (path.length === 0) {
        return root;
      }
      return weNeedToDigDeeper(root[path[0]], path.slice(1));
    };

    // Get the reference to the position we need to update -- and update it
    const path = weNeedToDigDeeper(this.getSubParams(this.params, data.library) || this.params, data.path);
    path[data.name] = data.translation;
  };

  /**
   * Get parameters of subcontent.
   *
   * @param {object} params - Params to start looking.
   * @param {string} libraryName - LibraryName to look for.
   * @return {object} Params.
   */
  BranchingScenarioEditor.prototype.getSubParams = function (params, libraryName) {
    if (typeof params !== 'object') {
      return;
    }
    if (typeof libraryName !== 'string') {
      return;
    }

    let results;
    if (params.library === libraryName && params.params) {
      results = params.params;
    }
    for (let param in params) {
      results = results || this.getSubParams(params[param], libraryName);
    }
    return results;
  };

  /**
   * Validate the current field.
   *
   * @returns {boolean} True if validatable.
   */
  BranchingScenarioEditor.prototype.validate = function () {
    // TODO: Run validate on all subcontent types to trigger the storing of values
    return true;
  };

  /**
   * Collect functions to execute once the tree is complete.
   *
   * @param {function} ready
   */
  BranchingScenarioEditor.prototype.ready = function (ready) {
    if (this.passReadies) {
      this.parent.ready(ready);
    }
    else {
      this.readies.push(ready);
    }
  };

  BranchingScenarioEditor.prototype.findField = function (name, fields) {
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].name === name) {
        return fields[i];
      }
    }
  };

  /**
   * Append Editor to DOM.
   *
   * @param {jQuery} $wrapper - Container in DOM.
   */
  BranchingScenarioEditor.prototype.appendTo = function ($wrapper) {
    $wrapper.parent().css('padding', 0);

    this.editor = ReactDOM.render(
      (<Editor
        translations={this.translations}
        libraries={this.libraries}
        settings={this.settings}
        startImageChooser={this.startImageChooser}
        endImageChooser={this.endImageChooser}
        updateParams={this.updateParams.bind(this)}
        updateTranslations={this.updateTranslations.bind(this)}
      />), $wrapper.get(0)
    );
  };

  return BranchingScenarioEditor;
})(H5P.jQuery);
