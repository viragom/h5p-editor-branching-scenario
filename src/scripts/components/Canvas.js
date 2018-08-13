import React from 'react';
import PropTypes from 'prop-types';
import './Canvas.scss';
import StartScreen from './StartScreen.js';
import Draggable from './Draggable.js';
import Dropzone from './Dropzone.js';
import ConfirmationDialog from './ConfirmationDialog.js';
import EditorOverlay from './EditorOverlay';

export default class Canvas extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      clickHandeled: false,
      placing: null,
      deleting: null,
      inserting: null,
      editorOverlayVisible: false,
      editorContents: {
        top: {
          icon: '',
          title: '',
          saveButton: "Save changes",
          closeButton: "close"
        },
        content: {
        }
      },
      nodeSpecs: { // TODO: Get from DOM ?
        width: 121,
        height: 32,
        spacing: {
          x: 29,
          y: 16
        }
      },
      content: this.props.content
    };
  }

  componentDidMount() {
    // Handle document clicks (for exiting placing mode/state)
    document.addEventListener('click', this.handleDocumentClick);
  }

  componentWillUnmount() {
    document.removeEventListener('click', this.handleDocumentClick);
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.inserting) {
      this.setState({
        placing: -1,
        library: nextProps.inserting.library
      });
    }
  }

  handleDocumentClick = () => {
    if (this.state.clickHandeled) {
      this.setState({
        clickHandeled: false
      });
    }
    else if (this.state.placing !== null) {
      this.setState({
        placing: null
      });
    }
  }

  handlePlacing = (id) => {
    if (this.state.placing !== null && this.state.placing !== id) {
      // Try to replace
      this.setState({
        clickHandeled: true,
        deleting: id  // TODO: Not if DZ is a BQ
      });
    }
    else {
      // Start placing
      this.setState({
        clickHandeled: true,
        placing: id
      });
    }
  }

  handleMove = (id) => {
    const draggable = this['draggable-' + id];
    const points = draggable.getPoints();
    this.dropzones.forEach(dropzone => {
      if (!dropzone || dropzone === draggable) {
        return; // Skip
      }

      if (dropzone.overlap(points)) {
        dropzone.highlight();
      }
      else {
        dropzone.dehighlight();
      }
    });
  }

  handleDropped = (id) => {
    // Check if the node overlaps with one of the drop zones
    const draggable = this['draggable-' + id];
    const points = draggable.getPoints();
    if (!this.dropzones.some(dropzone => {
      if (!dropzone || dropzone === draggable) {
        return; // Skip
      }

      if (dropzone.overlap(points)) {
        if (dropzone instanceof Draggable && !this.state.editorOverlayVisible) {
          this.setState({
            deleting: dropzone.props.id // TODO: Not if DZ is a BQ
          });
        }
        if (!this.state.editorOverlayVisible) {
          this.placeInTree(id, dropzone.props.nextContentId, dropzone.props.parent, dropzone.props.alternative);
        }
        else {
          const parentId = this.state.editorOverlay.handleSaveData(); // TODO: This should probably be done here
          if (parentId !== undefined) {
            this.placeInTree(id, dropzone.props.nextContentId, parentId, dropzone.props.alternative);
          }
        }
        return true;
      }
    })) {
      this.setState({
        placing: null
      });
    }
  }

  handleDropzoneClick = (nextContentId, parent, alternative) => {
    if (this.state.placing === null) {
      return;
    }

    this.placeInTree(this.state.placing, nextContentId, parent, alternative);
  }

  handleEditContent = (id) => {
    this.openEditor(this.state.content[id]);
  }

  getNewContentParams = () => {
    return {
      type: {
        library: this.state.library.name,
        params: {},
        subContentId: H5P.createUUID()
      },
      contentTitle: this.state.library.name.split('.')[1], // TODO: There's probably a better default
      showContentTitle: false,
    };
  }

  contentIsBranching(content) {
    return content.type.library.split(' ')[0] === 'H5P.BranchingQuestion';
  }

  updateNextContentId(leaf, id, currentNextId, nextContentId, bumpIdsUntil) {
    // Make old parent point directly to our old children
    if (leaf.nextContentId === id) {
      leaf.nextContentId = (currentNextId < 0 ? undefined : currentNextId);
    }

    // Make our new parent aware of us
    if (nextContentId !== undefined && leaf.nextContentId === nextContentId) {
      leaf.nextContentId = id;
    }

    // Bump IDs if array has changed
    if (leaf.nextContentId < bumpIdsUntil) {
      leaf.nextContentId++;
    }
  }

  placeInTree(id, nextContentId, parent, alternative) {
    this.setState(prevState => {
      let newState = {
        placing: null,
        inserting: null,
        content: [...prevState.content],
      };

      // Handle inserting of new node
      if (id === -1) {
        newState.content.push(this.getNewContentParams());
        id = newState.content.length - 1;
        newState.inserting = id;
        if (id === 0) {
          // This is the first node added, nothing more needs to be done.
          return newState;
        }
      }

      // When placing after a leaf node keep track of it so we can update it
      // after processing the new content array
      if (parent !== undefined) {
        parent = newState.content[parent];
      }
      const parentIsBranching = (parent && parent.type.library.split(' ')[0] === 'H5P.BranchingQuestion');

      const currentNextId = newState.content[id].nextContentId;
      // TODO: Make as solution for Branching Question?

      // Handle adding new top node before the current one
      let bumpIdsUntil = -1;
      if (nextContentId === 0) {
        // We are the new top node, we must move to the top of the array
        newState.content.splice(0, 0, newState.content[id]);

        // Mark IDs for bumping due to array changes
        bumpIdsUntil = id + 1;
      }

      // Handle moving current top node to somewhere else
      if (id === 0) {
        // Place our current next node at the top
        newState.content.splice(0, 0, newState.content[currentNextId]);

        // Mark IDs for bumping due to array changes
        bumpIdsUntil = currentNextId + 1;
      }

      newState.content.forEach((content, index) => {
        if (index === bumpIdsUntil) {
          return; // Duplicate in array, must not be processed twice.
        }

        if (this.contentIsBranching(content)) {
          if (content.type.params &&
              content.type.params.alternatives) {
            content.type.params.alternatives.forEach(alternative =>
              this.updateNextContentId(alternative, id, currentNextId, nextContentId, bumpIdsUntil));
          }
        }
        else {
          this.updateNextContentId(content, id, currentNextId, nextContentId, bumpIdsUntil);
        }
      });

      // Update parent directly when placing a new leaf node
      if (parent !== undefined) {
        if (parentIsBranching) {
          parent.type.params.alternatives[alternative].nextContentId = (id === 0 ? 1 : id);
        }
        else {
          parent.nextContentId = (id === 0 ? 1 : id);
        }
      }

      // Continue handling new top node
      if (nextContentId === 0) {
        // Remove old entry
        newState.content.splice(bumpIdsUntil, 1);

        // Use the previous top node as children
        newState.content[0].nextContentId = 1;
        // TODO: What to do if we are branching?
      }
      else if (id === 0) {
        // Remove duplicate entry
        newState.content.splice(bumpIdsUntil, 1);

        // Start using our new children
        newState.content[1].nextContentId = (nextContentId === 1 ? 2 : nextContentId);
        // TODO: What to do if we are branching?
      }
      else {
        newState.content[id].nextContentId = (nextContentId < 0 ? undefined : nextContentId);
      }

      return newState;
    }, () => {
      if (this.state.inserting === null || this.state.deleting !== null) {
        return;
      }
      this.handleInserted(this.state.content[this.state.inserting]);
    });
  }

  /**
   * Get Id of element. It's set implicitly by the position in the array.
   *
   * @param {object} contentItem - item to check for.
   * @return {number} position or -1.
   */
  handleNeedNodeId = (contentItem) => {
    return this.state.content.indexOf(contentItem);
  }

  renderDropzone(id, position, parent, num, parentIsBranching) {
    const nextContentId = (parent === undefined || parentIsBranching) ? id : undefined;
    if (num === undefined) {
      num = 0;
    }
    return ( !this.state.editorOverlayVisible &&
      <Dropzone
        key={ (id === -1 ? 'f' : (id === -2 ? 'a' + parent : id)) + '-dz-' + num} // TODO: Fix unique id
        ref={ element => this.dropzones.push(element) }
        nextContentId={ nextContentId }
        parent={ parent }
        alternative={ num }
        position={ position }
        elementClass={ 'dropzone' }
        style={
          {
            left: position.x + 'px',
            top: position.y + 'px'
          }
        }
        onClick={ () => this.handleDropzoneClick(nextContentId, parent, num) }
      />
    );
  }

  getLibraryTitle(library) {
    if (!this.props.libraries) {
      return library;
    }

    for (var i = 0; i < this.props.libraries.length; i++) {
      if (this.props.libraries[i].name === library) {
        return this.props.libraries[i].title;
      }
    }

    return library;
  }

  getBranchingChildren(content) {
    if (!content.type || !content.type.params ||
        !content.type.params.alternatives ||
        !content.type.params.alternatives.length) {
      return; // No alternatives today
    }

    let children = [];
    content.type.params.alternatives.forEach(alternative => {
      if (alternative.nextContentId === -1) {
        children.push(-1); // End screen
      }
      else if (alternative.nextContentId === undefined || this.state.content[alternative.nextContentId] === undefined) {
        children.push(-2); // Empty alternative
      }
      else {
        children.push(alternative.nextContentId); // Other question
      }
    });

    return children;
  }

  renderTree = (branch, x, y, parent) => {
    let nodes = [];

    // Libraries must be loaded before tree can be drawn
    if (!this.props.libraries || this.props.translations.length === 0) {
      nodes.push(
        <div key={ 'loading' } className="loading">Loading…</div>
      );
      branch = []; // Stops rendering
    }

    // Set defaults
    if (branch === undefined) {
      branch = [];
    }
    else if (!Array.isArray(branch)) {
      branch = [branch]; // Must always be array
    }
    if (x === undefined) {
      x = 0; // X level start
    }
    if (y === undefined) {
      y = 100; // Y level start
    }

    const parentIsBranching = (parent !== undefined && this.state.content[parent].type.library.split(' ')[0] === 'H5P.BranchingQuestion');

    let firstX, lastX;
    branch.forEach((id, num) => {
      const emptyAlternative = (parentIsBranching && id === -2); // -1 = end screen, -2 = empty
      const content = this.state.content[id];
      if (!content && !emptyAlternative) {
        return; // Does not exist, simply skip.
      }

      // Add vertical spacing for each level
      const branchY = y + ((parentIsBranching ? 8 : 5.5) * this.state.nodeSpecs.spacing.y); // *2 for the element itself

      // Determine if we are or parent is a branching question
      const contentIsBranching = (content && content.type.library.split(' ')[0] === 'H5P.BranchingQuestion');

      // Determine if we have any children
      const children = (contentIsBranching ? this.getBranchingChildren(content) : (content ? content.nextContentId : null));

      if (x !== 0 && num > 0) {
        x += this.state.nodeSpecs.spacing.x; // Add spacing between nodes
      }

      // Draw subtree first so we know where to position the node
      const subtree = children ? this.renderTree(children, x, branchY, id) : null;
      const subtreeWidth = subtree ? subtree.x - x : 0;

      // Determine position of node
      let position = {
        x: x,
        y: branchY - (this.state.nodeSpecs.spacing.y * 2) // *2 for the element itself
      };

      if (subtreeWidth >= this.state.nodeSpecs.width) {
        // Center parent above subtree
        position.x += ((subtree.x - x) / 2) - (this.state.nodeSpecs.width / 2);
      }

      if (content) {
        const libraryTitle = this.getLibraryTitle(content.type.library);

        // Draw node
        nodes.push(
          <Draggable
            key={ id }
            id={ id }
            ref={ element => { this['draggable-' + id] = element; if (this.state.placing !== null && this.state.placing !== id) this.dropzones.push(element); } }
            position={ position }
            width={ this.state.nodeSpecs.width }
            onPlacing={ () => this.handlePlacing(id) }
            onMove={ () => this.handleMove(id) }
            onDropped={ () => this.handleDropped(id) }
            contentClass={ libraryTitle }
            editContent={ () => this.handleEditContent(id) }
            disabled={ content.type.library.split(' ')[0] === 'H5P.BranchingQuestion' }
          >
            { libraryTitle }
          </Draggable>
        );
      }

      // Add vertical line above (except for top node)
      const aboveLineHeight = this.state.nodeSpecs.spacing.y * 3.5; // *3.5 = enough room for DZ
      const nodeWidth = (content ? (this.state.nodeSpecs.width / 2) : 21); // Half width actually...
      const nodeCenter = position.x + nodeWidth;
      if (content && id !== 0) {
        nodes.push(
          <div key={ id + '-vabove' } className="vertical-line" style={ {
            left: nodeCenter + 'px',
            top: (position.y - aboveLineHeight) + 'px',
            height: aboveLineHeight + 'px'
          } }/>
        );
      }

      // Extra lines for BQ
      if (contentIsBranching && content.type.params.alternatives && content.type.params.alternatives.length > 1) {
        // Add vertical line below
        nodes.push(
          <div key={ id + '-vbelow' } className="vertical-line" style={ {
            left: nodeCenter + 'px',
            top: (position.y + this.state.nodeSpecs.height) + 'px',
            height: (this.state.nodeSpecs.spacing.y / 2) + 'px'
          } }/>
        );

        // Add horizontal line below
        nodes.push(
          <div key={ id + '-hbelow' } className="horizontal-line" style={ {
            left: (x + (children[0] < 0 ? 42 / 2 : this.state.nodeSpecs.width / 2)) + 'px',
            top: (position.y + this.state.nodeSpecs.height + (this.state.nodeSpecs.spacing.y / 2)) + 'px',
            width: subtree.dX + 'px'
          } }/>
        );
      }

      if (parentIsBranching) {
        const lengthMultiplier = (branch.length > 1 ? 2 : 2.5);
        nodes.push(
          <div key={ parent + '-vabovebs-' + num } className="vertical-line" style={ {
            left: nodeCenter + 'px',
            top: (position.y - aboveLineHeight - (this.state.nodeSpecs.spacing.y * lengthMultiplier)) + 'px',
            height: (this.state.nodeSpecs.spacing.y * lengthMultiplier) + 'px'
          } }/>
        );
        nodes.push(
          <div key={ parent + '-abox-' + num } className="alternative-ball" style={ {
            left: (nodeCenter - (this.state.nodeSpecs.spacing.y * 0.75) + 1) + 'px',
            top: (position.y - aboveLineHeight - (this.state.nodeSpecs.spacing.y * 1.5)) + 'px'
          } }>A{ num + 1 }</div>
        );
      }

      // Add dropzones when placing, except for below the one being moved
      if (this.state.placing !== null && this.state.placing !== id) {
        const dzDistance = ((aboveLineHeight - 42) / 2);

        // TODO: Only render leafs when placing BQ, or add existing structure to BQ alternative?

        // Add dropzone above
        if (this.state.placing !== parent) {
          nodes.push(this.renderDropzone(id, {
            x: nodeCenter - (42 / 2), // 42 = size of DZ  TODO: Get from somewhere?
            y: position.y - 42 - dzDistance
          }, parentIsBranching ? parent : undefined, parentIsBranching ? num : 0, parentIsBranching));
        }

        // Add dropzone below if there's no subtree
        if (content && (!subtree || !subtree.nodes.length)) {
          nodes.push(this.renderDropzone(id, {
            x: nodeCenter - (42 / 2), // 42 = size of DZ  TODO: Get from somewhere?
            y: position.y + (this.state.nodeSpecs.spacing.y * 2) + dzDistance
          }, id, 1));
        }
      }

      // Increase same level offset + offset required by subtree
      const elementWidth = (content ? this.state.nodeSpecs.width : 42);
      x += (subtreeWidth >= this.state.nodeSpecs.width ? subtreeWidth : elementWidth);

      if (subtree) {
        // Merge our trees
        nodes = nodes.concat(subtree.nodes);
      }

      if (firstX === undefined) {
        firstX = position.x + nodeWidth;
      }
      lastX = position.x + nodeWidth;
    });

    return {
      nodes: nodes,
      x: x,
      dX: (firstX !== undefined ? lastX - firstX : 0) // Width of this subtree level only (used for pretty trees)
    };
  }

  /**
   * Remove a leaf from the tree (if it's really a leaf).
   * TODO: Can probably be replaced by general delete function
   *
   * @param {number} id - Id of the leaf.
   *
   */
  handleRemoveLeaf = (id) => {
    if (id < this.state.content.length && !this.state.content[id].nextContentId) {
      this.setState((prevState) => {
        prevState.content.splice(id, 1);
      });
    }
  }

  /**
   * Toggle the editor overlay.
   *
   * @param {boolean} visibility - Override visibility toggling.
   */
  toggleEditorOverlay = (visibility) => {
    this.setState((prevState) => {
      return {editorOverlayVisible: visibility || !prevState.editorOverlayVisible};
    });
  }

  updateNextContentIdAfterReplace(leaf, id, currentNextId) {
    // Move current children of the moved node to grand parent
    if (leaf.nextContentId === id) {
      leaf.nextContentId = currentNextId;
    }

    // Decrease all next ID values larger than the deleted node
    if (leaf.nextContentId > id) {
      leaf.nextContentId--;
    }
  }

  handleDelete = () => {
    // Set new parent for node
    this.setState(prevState => {
      let newState = {
        placing: null,
        deleting: null,
        content: [...prevState.content]
      };

      let id = this.state.placing;
      if (id === -1) {
        // Insert new node
        newState.content.push(this.getNewContentParams());
        id = newState.content.length - 1;
      }

      const currentNextId = newState.content[id].nextContentId;
      // TODO: What to do if we are a branching?

      // Make their children our own
      newState.content[id].nextContentId = newState.content[this.state.deleting].nextContentId;
      // TODO: Handle branching scenario

      // Replace the node (preserves tree drawing order)
      newState.content[this.state.deleting] = newState.content[id];
      newState.content.splice(id, 1);

      // What are we doing?
      newState.content.forEach(content => {
        if (this.contentIsBranching(content)) {
          if (content.type.params &&
              content.type.params.alternatives) {
            content.type.params.alternatives.forEach(alternative =>
              this.updateNextContentIdAfterReplace(alternative, id, currentNextId));
          }
        }
        else {
          this.updateNextContentIdAfterReplace(content, id, currentNextId);
        }
      });

      return newState;
    });
  }

  handleCancel = () => {
    this.setState({
      placing: null,
      deleting: null
    });
  }

  componentDidUpdate() {

    // Center the tree
    if (this.treeWidth !== this.lastTreeWidth) {
      this.lastTreeWidth = this.treeWidth;
      this.refs.tree.style.marginLeft = '';
      const raw = this.refs.tree.getBoundingClientRect();
      this.refs.tree.style.marginLeft = ((raw.width - this.treeWidth) / 2) + 'px';
    }
  }

  /**
   * Add an element.
   *
   * @param {object} element - Element to add.
   */
  handlePushElement = (element) => {
    this.dropzones.push(element);
  }

  /**
   * Handle insertion of new data.
   *
   * @param {object} data - New data.
   */
  handleInserted = (data) => {
    this.openEditor(data, {state: 'new'});
  }

  /**
   * Open editor.
   *
   * @param {object} data - Data.
   * @param {object} params - Params.
   */
  openEditor = (data, params) => {
    if (data) {
      data.$form = H5P.jQuery('<div/>');
      // TODO: Check why process SemanticsChunk crashes here with CoursePresentation
      // TODO: Instead of updating an existing form, create a new one and destroy it after it was used
      this.state.editorOverlay.updateForm(data, this.props.getSemantics(data.type.library), params);
      this.toggleEditorOverlay(true);
    }

    this.props.onOpenEditor(null);
  }

  /**
   * Set reference to Editor Overlay DOM.
   *
   * @param {object} ref - Reference.
   */
  handleRef = (ref) => {
    this.setState({
      editorOverlay: ref
    });
  }

  render() {
    this.dropzones = [];

    // Generate the tree
    const tree = this.renderTree(0);
    this.treeWidth = tree.x;

    return (
      <div className="wrapper">

        { !! this.props.inserting &&
          <Draggable
            inserting={ this.props.inserting }
            ref={ element => this['draggable--1'] = element }
            width={ this.state.nodeSpecs.width }
            onMove={ () => this.handleMove(-1) }
            onDropped={ () => this.handleDropped(-1) }
            contentClass={ this.props.inserting.library.title.replace(/ +/g, '') }
            position={ this.props.inserting.position }
          >
            { this.props.inserting.library.title }
          </Draggable>
        }

        <div className="canvas">
          { this.state.deleting !== null &&
            <ConfirmationDialog
              handleDelete={ this.handleDelete }
              handleCancel={ this.handleCancel }
            />
          }
          <div className="tree" ref={ 'tree' }>
            { tree.nodes }
          </div>
          { !tree.nodes.length &&
            <StartScreen
              handleClicked={ this.props.navigateToTutorial }
            >
              { this.renderDropzone(-1, {
                x: 363.19, // TODO: Decide on spacing a better way?
                y: 130
              }) }
            </StartScreen>
          }
          <EditorOverlay // TODO: It's quite difficult to see which content the overlay is being displayed for
            onRef={ this.handleRef }
            visibility={ this.state.editorOverlayVisible }
            editorContents={ this.state.editorContents }
            form={{}}
            onNextPathDrop={ this.handlePushElement }
            handleNeedNodeId={ this.handleNeedNodeId }
            closeForm={ this.toggleEditorOverlay }
            onRemoveData={ this.handleRemoveLeaf }
            main={ this.props.main }
            content={ this.state.content }
            onContentChanged={ this.props.onContentChanged(this.state.content) }
          />
        </div>
      </div>
    );
  }
}

Canvas.propTypes = {
  width: PropTypes.number,
  inserting: PropTypes.object
};
