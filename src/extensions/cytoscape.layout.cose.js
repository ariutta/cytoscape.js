;(function($$) {

    /**
     * @brief :  default layout options
     */
    var defaults = {
	ready             : function() {},
	stop              : function() {},
	numIter           : 5,
	refresh           : 1,     // TODO: Change it to 0
	fit               : false, 
	randomize         : false, 
	debug             : true,
	defaultEdgeWeight : 1,
	nestingFactor     : 1.5
    };


    /**
     * @brief       : constructor
     * @arg options : object containing layout options
     */
    function CoseLayout(options) {
	this.options = $$.util.extend(true, {}, defaults, options); 
    }


    /**
     * @brief : runs the layout
     */
    CoseLayout.prototype.run = function(){	
	var options = this.options;
	var cy      = options.cy;
	
	// Set DEBUG - Global variable
	if (true == options.debug) {
	    DEBUG = true;
	} else {
	    DEBUG = false;
	}

	// Initialize layout info
	var layoutInfo = createLayoutInfo(cy, options);
	
	// Show LayoutInfo contents if debugging
	if (DEBUG) {	    
	    printLayoutInfo(layoutInfo);
	}

	// If required, randomize node positions
	if (true == options.randomize) {
	    randomizePositions(layoutInfo, cy);
	    if (0 < options.refresh) {
		refreshPositions(layoutInfo, cy, options);
	    }
	}

	// Main loop
	for (var i = 0; i < options.numIter; i++) {
	    // Do one step in the phisical simmulation
	    step(layoutInfo, cy, options);

	    // If required, update positions
	    if (0 < options.refresh && 0 == (i % options.refresh)) {
		refreshPositions(layoutInfo, cy, options);
	    }

	    // ONLY FOR DEBUGGING! TODO: Remove before release
// 	    var delay       = 1; 
// 	    var now         = new Date();
// 	    var desiredTime = new Date().setSeconds(now.getSeconds() + delay);	
// 	    while (now < desiredTime) {
// 	    	now = new Date();
// 	    }

	}
	
	refreshPositions(layoutInfo, cy, options);

	// Fit the graph if necessary
	if (true == options.fit) {
	    cy.fit();
	}

	// Layout has finished
	cy.one("layoutstop", options.stop);
	cy.trigger("layoutstop");
    };


    /**
     * @brief : called on continuous layouts to stop them before they finish
     */
    CoseLayout.prototype.stop = function(){
	var options = this.options;

	cy.one("layoutstop", options.stop);
	cy.trigger("layoutstop");
    };


    /**
     * @brief     : Creates an object which is contains all the data
     *              used in the layout process
     * @arg cy    : cytoscape.js object
     * @return    : layoutInfo object initialized
     */
    function createLayoutInfo(cy, options) {
	var layoutInfo   = {
	    layoutNodes  : [], 
	    idToIndex    : {},
	    nodeSize     : cy.nodes().size(),
	    graphSet     : [],
	    indexToGraph : [], 
	    layoutEdges  : [],
	    edgeSize     : cy.edges().size()
	}; 
	
	// Shortcut
	var nodes = cy.nodes();
	
	// Iterate over all nodes, creating layout nodes
	for (var i = 0; i < layoutInfo.nodeSize; i++) {
	    var tempNode        = {};
	    tempNode.id         = nodes[i].data('id');
	    tempNode.parentId   = nodes[i].data('parent');	    
	    tempNode.children   = [];
	    tempNode.positionX  = nodes[i].position('x');
	    tempNode.positionY  = nodes[i].position('y');
	    tempNode.offsetX    = 0;	    
	    tempNode.offsetY    = 0;
	    // Add new node
	    layoutInfo.layoutNodes.push(tempNode);
	    // Add entry to id-index map
	    layoutInfo.idToIndex[tempNode.id] = i;
	}

	// Inline implementation of a queue, used for traversing the graph in BFS order
	var queue = [];
	var start = 0;   // Points to the start the queue
	var end   = -1;  // Points to the end of the queue

	var tempGraph = [];

	// Second pass to add child information and 
	// initialize queue for hierarchical traversal
	for (var i = 0; i < layoutInfo.nodeSize; i++) {
	    var n = layoutInfo.layoutNodes[i];
	    var p_id = n.parentId;
	    // Check if node n has a parent node
	    if (undefined != p_id) {
		// Add node Id to parent's list of children
		layoutInfo.layoutNodes[layoutInfo.idToIndex[p_id]].children.push(n.id);
	    } else {
		// If a node doesn't have a parent, then it's in the root graph
		queue[++end] = n.id;
		tempGraph.push(n.id);
		
	    }
	}
	
	// Add root graph to graphSet
	layoutInfo.graphSet.push(tempGraph);

	// Traverse the graph, level by level, 
	while (start <= end) {
	    // Get the node to visit and remove it from queue
	    var node_id  = queue[start++];
	    var node_ix  = layoutInfo.idToIndex[node_id];
	    var node     = layoutInfo.layoutNodes[node_ix];
	    var children = node.children;
	    if (children.length > 0) {
		// Add children nodes as a new graph to graph set
		layoutInfo.graphSet.push(children);
		// Add children to que queue to be visited
		for (var i = 0; i < children.length; i++) {
		    queue[++end] = children[i];
		}
	    }
	}

	// Create indexToGraph map
	for (var i = 0; i < layoutInfo.graphSet.length; i++) {	    
	    var graph = layoutInfo.graphSet[i];
	    for (var j = 0; j < graph.length; j++) {
		var index = layoutInfo.idToIndex[graph[j]];
		layoutInfo.indexToGraph[index] = i;
	    }
	}

	// Shortcut
	var edges = cy.edges();
	
	// Iterate over all edges, creating Layout Edges
	for (var i = 0; i < layoutInfo.edgeSize; i++) {
	    var e = edges[i];
	    var tempEdge = {};	    
	    tempEdge.id       = e.data('id');
	    tempEdge.sourceId = e.data('source');
	    tempEdge.targetId = e.data('target');
	    // Check whether the edge has a defined weigth
	    var weigth = e.data('weigth');
	    if (undefined != weigth) {
		tempEdge.weigth = weigth;
	    } else {
		// Use default weigth
		tempEdge.weigth = options.defaultEdgeWeigth;
	    }
	    // Compute ideal length
	    var idealLength = 100;       // TODO: Change this.

	    // Check if it's an inter graph edge
	    var sourceIx    = layoutInfo.idToIndex[tempEdge.sourceId];
	    var targetIx    = layoutInfo.idToIndex[tempEdge.targetId];
	    var sourceGraph = layoutInfo.indexToGraph[sourceIx];
	    var targetGraph = layoutInfo.indexToGraph[targetIx];

	    if (sourceGraph != targetGraph) {
		// Find lowest common graph ancestor
		// 0 is the root graph index
		var lca = findLCA(tempEdge.sourceId, tempEdge.sourceId, 0, layoutInfo);

		// Compute sum of node depths, relative to lca graph
		var lcaGraph = layoutInfo.graphSet[lca];
		var depth    = 0;

		// Source depth
		var tempNode = layoutInfo.layoutNodes[sourceIx];
		while (-1 == $.inArray(tempNode.id, lcaGraph)) {
		    tempNode = layoutInfo.layoutNodes[layoutInfo.idToIndex[tempNode.parentId]];
		    depth++;
		}

		// Target depth
		tempNode = layoutInfo.layoutNodes[targetIx];
		while (-1 == $.inArray(tempNode.id, lcaGraph)) {
		    tempNode = layoutInfo.layoutNodes[layoutInfo.idToIndex[tempNode.parentId]];
		    depth++;
		}

		logDebug("LCA of nodes " + tempEdge.sourceId + " and " + tempEdge.targetId +  
			 ". Index: " + lca + " Contents: " + lcaGraph.toString() + 
			 ". Depth: " + depth);

		// Update idealLength
		idealLength *= depth * options.nestingFactor;
	    }

	    tempEdge.idealLength = idealLength;

	    layoutInfo.layoutEdges.push(tempEdge);
	}

	// Finally, return layoutInfo object
	return layoutInfo;
    }

    
    /**
     * @brief : This function finds the index of the lowest common 
     *          graph ancestor between 2 nodes in the subtree 
     *          (from the graph hierarchy induced tree) whose
     *          root is graphIx
     *
     * @pre   : Both nodes belong to the subtree whose root is graphIx 
     */
    function findLCA(node1, node2, graphIx, layoutInfo) {
	var graph = layoutInfo.graphSet[graphIx];
	// If either node  belongs to graphIx
	if (-1 < $.inArray(node1, graph) || -1 < $.inArray(node2, graph)) {
	    return graphIx;
	}

	// Make recursive calls for all subgraphs
	var result = undefined;
	for (var i = 0; i < graph.length; i++) {
	    var nodeId   = graph[i];
	    var nodeIx   = layoutInfo.idToIndex[nodeId];
	    var children = layoutInfo.layoutNodes[nodeIx].children;
	    // If the node has no child, skip it
	    if (0 == children.length) {
		continue;
	    }
	    var childGraphIx = layoutInfo.indexToGraph[layoutInfo.idToIndex[children[0]]];
	    result = findLCA(node1, node2, childGraphIx, layoutInfo);
	    // If found common ancestor
	    if (undefined != result) {
		return result;
	    }
	}
	
	// If no better result found, then they are in separate subtrees
	return graphIx;
    }


    /**
     * @brief: printsLayoutInfo into js console
     *         Only used for debbuging 
     */
    function printLayoutInfo(layoutInfo) {
	console.debug("layoutNodes:");
	for (var i = 0; i < layoutInfo.nodeSize; i++) {
	    var n = layoutInfo.layoutNodes[i];
	    var s = 
		"\nindex: "     + i + 
		"\nId: "        + n.id + 
		"\nChildren: "  + n.children.toString() +  
		"\nparentId: "  + n.parentId  + 
		"\npositionX: " + n.positionX + 
		"\npositionY: " + n.positionY;
	    console.debug(s);		
	}	
	
	console.debug("idToIndex");
	for (var i in layoutInfo.idToIndex) {
	    console.debug("Id: " + i + "\nIndex: " + layoutInfo.idToIndex[i]);
	}

	console.debug("Graph Set");
	var set = layoutInfo.graphSet;
	for (var i = 0; i < set.length; i ++) {
	    console.debug("Set : " + i + ": " + set[i].toString());
	} 

	var s = "IndexToGraph";
	for (var i = 0; i < layoutInfo.indexToGraph.length; i ++) {
	    s += "\nIndex : " + i + " Graph: "+ layoutInfo.indexToGraph[i];
	}
	console.debug(s);

	s = "Layout Edges";
	for (var i = 0; i < layoutInfo.layoutEdges.length; i++) {
	    var e = layoutInfo.layoutEdges[i];
	    s += "\nEdge Index: " + i + " ID: " + e.id + 
		" SouceID: " + e.sourceId + " TargetId: " + e.targetId + 
		" Weigth: " + e.weigth + " Ideal Length: " + e.idealLength;
	}
	console.debug(s);

	return;
    }


    /**
     * @brief : Randomizes the position of all nodes
     */
    function randomizePositions(layoutInfo, cy) {
	var container = cy.container();
	var width     = container.clientWidth;
	var height    = container.clientHeight;

	for (var i = 0; i < layoutInfo.nodeSize; i++) {
	    var n = layoutInfo.layoutNodes[i];
	    // No need to randomize compound nodes
	    if (0 == n.children.length) {
		n.positionX = Math.round(Math.random() * width);
		n.positionY = Math.round(Math.random() * height);
	    }
	}
    }

    
    /**
     * @brief          : Updates the positions of nodes in the network
     * @arg layoutInfo : LayoutInfo object
     * @arg cy         : Cytoscape object
     * @arg options    : Layout options
     */
    function refreshPositions(layoutInfo, cy, options) {
	var container = cy.container();
	var width     = container.clientWidth;
	var height    = container.clientHeight;
	
	var s = "Refreshing positions";
	logDebug(s);

	cy.nodes().positions(function(i, ele) {
	    lnode = layoutInfo.layoutNodes[layoutInfo.idToIndex[ele.data('id')]];
	    s = "Node: " + lnode.id + ". Refreshed position: (" + 
		lnode.positionX + ", " + lnode.positionY + ").";
	    logDebug(s);
	    return {
		x: lnode.positionX,
		y: lnode.positionY
	    };
	});
	
	if (true != refreshPositions.ready) {
	    s = "Triggering layoutready";
	    logDebug(s);
	    refreshPositions.ready = true;
	    cy.one("layoutready", options.ready);
	    cy.trigger("layoutready");
	}
    }


    /**
     * @brief          : Performs one iteration of the physical simulation
     * @arg layoutInfo : LayoutInfo object already initialized
     * @arg cy         : Cytoscape object
     * @arg options    : Layout options
     */
    function step(layoutInfo, cy, options) {	
	// Calculate node repulsions
	calculateNodeForces(layoutInfo, cy, options);
	// Calculate edge forces
	calculateEdgeForces(layoutInfo, cy, options);
	// Calculate gravity forces
	calculateGravityForces(layoutInfo, cy, options);
	// Propagate forces from parent to child
	propagateForces(layoutInfo, cy, options);
	// Update positions based on calculated forces
	updatePositions(layoutInfo, cy, options);
    }

    
    /**
     * @brief : 
     */
    function calculateNodeForces(layoutInfo, cy, options) {
	// Go through each of the graphs in graphSet
	// Nodes only repel each other if they belong to the same graph
	var s = "calculateNodeForces";
	logDebug(s);
	for (var i = 0; i < layoutInfo.graphSet.length; i ++) {
	    var graph    = layoutInfo.graphSet[i];
	    var numNodes = graph.length;

	    s = "Set: " + graph.toString();
	    logDebug(s);

	    // Now get all the pairs of nodes 
	    // Only get each pair once, (A, B) = (B, A)
	    for (var j = 0; j < numNodes; j++) {
		var node1 = layoutInfo.layoutNodes[layoutInfo.idToIndex[graph[j]]];
		for (var k = j + 1; k < numNodes; k++) {
		    var node2 = layoutInfo.layoutNodes[layoutInfo.idToIndex[graph[k]]];
		    nodeRepulsion(node1, node2, layoutInfo, cy, options);
		} 
	    }
	} 
    }


    /**
     * @brief : 
     */
    function nodeRepulsion(node1, node2, layoutInfo, cy, options) {
	// Compute distances between nodes
	var distanceX   = node2.positionX - node1.positionX;
	var distanceY   = node2.positionY - node1.positionY;
	var distanceSqr = distanceX * distanceX + distanceY * distanceY;
	var distance    = Math.sqrt(distanceSqr);
	// Compute the module of the force vector
	var force  = 100000 / distanceSqr;  // TODO: Modify this
	var forceX = force * distanceX / distance;
	var forceY = force * distanceY / distance;
	// Apply force
	node1.offsetX -= forceX;
	node1.offsetY -= forceY;
	node2.offsetX += forceX;
	node2.offsetY += forceY;

	var s = "Node repulsion. Node1: " + node1.id + " Node2: " + node2.id +
	    " Distance: " + distance + " ForceX: " + forceX + " ForceY: " + forceY;
	logDebug(s);

	return;
    }


    /**
     * @brief : 
     */
    function calculateEdgeForces(layoutInfo, cy, options) {
	// Iterate over all edges
	for (var i = 0; i < layoutInfo.edgeSize; i++) {
	    // Get edge, source & target nodes
	    var edge        = layoutInfo.layoutEdges[i];
	    var sourceIx    = layoutInfo.idToIndex[edge.sourceId];
	    var source      = layoutInfo.layoutNodes[sourceIx];
	    var targetIx    = layoutInfo.idToIndex[edge.targetId];
	    var target      = layoutInfo.layoutNodes[targetIx];
	}
    }


    /**
     * @brief : 
     */
    function calculateGravityForces(layoutInfo, cy, options) {
	return;
    }


    /**
     * @brief          : This function propagates the existing offsets from 
     *                   parent nodes to its descendents.
     * @arg layoutInfo : layoutInfo Object
     * @arg cy         : cytoscape Object
     * @arg options    : Layout options
     */
    function propagateForces(layoutInfo, cy, options) {	
	// Inline implementation of a queue, used for traversing the graph in BFS order
	var queue = [];
	var start = 0;   // Points to the start the queue
	var end   = -1;  // Points to the end of the queue

	logDebug("propagateForces");

	// Start by visiting the nodes in the root graph
	queue.push.apply(queue, layoutInfo.graphSet[0]);
	end += layoutInfo.graphSet[0].length;

	// Traverse the graph, level by level, 
	while (start <= end) {
	    // Get the node to visit and remove it from queue
	    var nodeId    = queue[start++];
	    var nodeIndex = layoutInfo.idToIndex[nodeId];
	    var node      = layoutInfo.layoutNodes[nodeIndex];
	    var children  = node.children;

	    // We only need to process the node if it's compound
	    if (0 < children.length) {		
		var offX = node.offsetX;
		var offY = node.offsetY;

		var s = "Propagating offset from parent node : " + node.id + 
		    ". OffsetX: " + offX + ". OffsetY: " + offY;
		s += "\n Children: " + children.toString();
		logDebug(s);
		
		for (var i = 0; i < children.length; i++) {
		    var childNode = layoutInfo.layoutNodes[layoutInfo.idToIndex[children[i]]];
		    // Propagate offset
		    childNode.offsetX += offX;
		    childNode.offsetY += offY;
		    // Add children to queue to be visited
		    queue[++end] = children[i];
		}
		
		// Reset parent offsets
		node.offsetX = 0;
		node.offsetY = 0;
	    }
	    
	}
    }


    /**
     * @brief : 
     */
    function updatePositions(layoutInfo, cy, options) {
	var s = "Updating positions";
	logDebug(s);
	for (var i = 0; i < layoutInfo.nodeSize; i++) {
	    var n = layoutInfo.layoutNodes[i];
	    if (0 < n.children.length) {
		// No need to set compound node position
		logDebug("Skipping position update of node: " + n.id);
		continue;
	    }
	    s = "Node: " + n.id + " Previous position: (" + 
		n.positionX + ", " + n.positionY + ")."; 
	    n.positionX += n.offsetX; 
	    n.positionY += n.offsetY;
	    n.offsetX = 0;
	    n.offsetY = 0;
	    s += " New Position: (" + n.positionX + ", " + n.positionY + ").";
	    logDebug(s);	    
	}
    }


    /**
     * @brief : Logs a debug message in JS console, if DEBUG is on
     */
    function logDebug(text) {
	if (DEBUG) {
	    console.debug(text);
	}
    }


    // register the layout
    $$("layout", "cose", CoseLayout);

})(cytoscape);
