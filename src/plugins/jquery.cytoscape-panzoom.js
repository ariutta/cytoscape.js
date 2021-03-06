
/*

Cytoscape Web panzoom UI plugin

Depends on
- jQuery UI core
	- draggable
	- slider
	- Theme Roller UI icons (if you want)

*/

;(function($){
	
	var defaults = {
		zoomFactor: 0.05, // zoom factor per zoom tick
		zoomDelay: 16, // how many ms between zoom ticks
		minZoom: 0.1, // min zoom level
		maxZoom: 10, // max zoom level
		fitPadding: 50, // padding when fitting
		panSpeed: 10, // how many ms in between pan ticks
		panDistance: 10, // max pan distance per tick
		panDragAreaSize: 75, // the length of the pan drag box in which the vector for panning is calculated (bigger = finer control of pan speed and direction)
		panMinPercentSpeed: 0.25, // the slowest speed we can pan by (as a percent of panSpeed)
		panInactiveArea: 8, // radius of inactive area in pan drag box
		panIndicatorMinOpacity: 0.65, // min opacity of pan indicator (the draggable nib); scales from this to 1.0
		autodisableForMobile: true // disable the panzoom completely for mobile (since we don't really need it with gestures like pinch to zoom)
	};
	
	$.fn.cytoscapePanzoom = function(params){
		var options = $.extend(true, {}, defaults, params);
		var fn = params;
		
		var functions = {
			destroy: function(){
				var $this = $(this);
				
				$this.find(".ui-cytoscape-panzoom").remove();
			},
				
			init: function(){
				var browserIsMobile = 'ontouchstart' in window;
				
				if( browserIsMobile && options.autodisableForMobile ){
					return $(this);
				}
				
				return $(this).each(function(){
					var $container = $(this);
					
					var $panzoom = $('<div class="ui-cytoscape-panzoom"></div>');
					$container.append( $panzoom );
					
					if( options.staticPosition ){
						$panzoom.addClass("ui-cytoscape-panzoom-static");
					}
					
					// add base html elements
					/////////////////////////

					var $zoomIn = $('<div class="ui-cytoscape-panzoom-zoom-in ui-cytoscape-panzoom-zoom-button"></div>');
					$panzoom.append( $zoomIn );
					
					var $zoomOut = $('<div class="ui-cytoscape-panzoom-zoom-out ui-cytoscape-panzoom-zoom-button"></div>');
					$panzoom.append( $zoomOut );
					
					var $reset = $('<div class="ui-cytoscape-panzoom-reset ui-cytoscape-panzoom-zoom-button"></div>');
					$panzoom.append( $reset );
					
					var $slider = $('<div class="ui-cytoscape-panzoom-slider"></div>');
					$panzoom.append( $slider );
					
					$slider.append('<div class="ui-cytoscape-panzoom-slider-background"></div>');

					var $sliderHandle = $('<div class="ui-cytoscape-panzoom-slider-handle"></div>');
					$slider.append( $sliderHandle );
					
					var $panner = $('<div class="ui-cytoscape-panzoom-panner"></div>');
					$panzoom.append( $panner );
					
					var $pHandle = $('<div class="ui-cytoscape-panzoom-panner-handle"></div>');
					$panner.append( $pHandle );
					
					var $pUp = $('<div class="ui-cytoscape-panzoom-pan-up ui-cytoscape-panzoom-pan-button"></div>');
					var $pDown = $('<div class="ui-cytoscape-panzoom-pan-down ui-cytoscape-panzoom-pan-button"></div>');
					var $pLeft = $('<div class="ui-cytoscape-panzoom-pan-left ui-cytoscape-panzoom-pan-button"></div>');
					var $pRight = $('<div class="ui-cytoscape-panzoom-pan-right ui-cytoscape-panzoom-pan-button"></div>');
					$panner.append( $pUp ).append( $pDown ).append( $pLeft ).append( $pRight );
					
					var $pIndicator = $('<div class="ui-cytoscape-panzoom-pan-indicator"></div>');
					$panner.append( $pIndicator );
					
					// functions for calculating panning
					////////////////////////////////////

					function handle2pan(e){
						var v = {
							x: e.originalEvent.pageX - $panner.offset().left - $panner.width()/2,
							y: e.originalEvent.pageY - $panner.offset().top - $panner.height()/2
						}
						
						var r = options.panDragAreaSize;
						var d = Math.sqrt( v.x*v.x + v.y*v.y );
						var percent = Math.min( d/r, 1 );
						
						if( d < options.panInactiveArea ){
							return {
								x: NaN,
								y: NaN
							};
						}
						
						v = {
							x: v.x/d,
							y: v.y/d
						};
						
						percent = Math.max( options.panMinPercentSpeed, percent );
						
						var vnorm = {
							x: -1 * v.x * (percent * options.panDistance),
							y: -1 * v.y * (percent * options.panDistance)
						};
						
						return vnorm;
					}
					
					function donePanning(){
						clearInterval(panInterval);
						$(window).unbind("mousemove", handler);
						
						$pIndicator.hide();
					}
					
					function positionIndicator(pan){
						var v = pan;
						var d = Math.sqrt( v.x*v.x + v.y*v.y );
						var vnorm = {
							x: -1 * v.x/d,
							y: -1 * v.y/d
						};
						
						var w = $panner.width();
						var h = $panner.height();
						var percent = d/options.panDistance;
						
						$pIndicator.show().css({
							left: w/2 * vnorm.x + w/2,
							top: h/2 * vnorm.y + h/2,
							opacity: Math.max( options.panIndicatorMinOpacity, percent )
						});
					}
					
					var zx, zy;
					zx = $container.width()/2;
					zy = $container.height()/2;
					function zoomTo(level){
						var cy = $container.cytoscape("get"); // Thanks dmackenzie1@github!

						cy.zoom({
							level: level,
							renderedPosition: {
								x: zx,
								y: zy
							}
						});
					}

					var panInterval;
					
					var handler = function(e){
						e.stopPropagation(); // don't trigger dragging of panzoom
						e.preventDefault(); // don't cause text selection
						clearInterval(panInterval);
						
						var pan = handle2pan(e);
						
						if( isNaN(pan.x) || isNaN(pan.y) ){
							$pIndicator.hide();
							return;
						}
						
						positionIndicator(pan);
						panInterval = setInterval(function(){
							$container.cytoscape("get").panBy(pan);
						}, options.panSpeed);
					};
					
					$pHandle.bind("mousedown", function(e){
						// handle click of icon
						handler(e);
						
						// update on mousemove
						$(window).bind("mousemove", handler);
					});
					
					$pHandle.bind("mouseup", function(){
						donePanning();
					});
					
					$(window).bind("mouseup blur", function(){
						donePanning();
					});
					


					// set up slider behaviour
					//////////////////////////

					var sliderMax = 100;
					var sliderMin = Math.floor( Math.log(options.minZoom)/Math.log(options.maxZoom) * sliderMax );
					var sliderVal;

					var sliderMdownHandler, sliderMmoveHandler;
					$sliderHandle.bind('mousedown', sliderMdownHandler = function( mdEvt ){
						var handleOffset = mdEvt.offsetY;

						$(window).bind('mousemove', sliderMmoveHandler = function( mmEvt ){
							var min = 0;
							var max = $slider.height() - $sliderHandle.height();
							var top = mmEvt.pageY - $slider.offset().top - handleOffset;

							// constrain to slider bounds
							if( top < min ){ top = min }
							if( top > max ){ top = max }

							var percent = (top - min) / ( max - min );

							// move the handle
							$sliderHandle.css('top', top);

							// change the zoom level
							var zoomLevel = Math.pow( 10, percent/100 );
							zoomTo( zoomLevel );

							return false;
						});

						// unbind when 
						$(window).bind('mouseup', function(){
							$(window).unbind('mousemove', sliderMmoveHandler);
						});

						return false;
					});

/*
					function getSliderVal(){
						var $handle = $slider.find(".ui-slider-handle");
						var $parent = $handle.parent();
						var pos = $handle.position();
						
						var width = $parent.width();
						var height = $parent.height();
						var left = pos.left;
						var bottom = height - pos.top;
						
						var range = sliderMax - sliderMin;
						var min = sliderMin;
						var percent = options.staticPosition ? (bottom / height) : (left / width);
						
						return Math.round( percent * range + min );
					}
					
					function setZoomViaSlider(){
						var cy = $container.cytoscape("get");
						var val = getSliderVal();
						
						var zoom = slider2zoom(val);
						
						clearTimeout(sliderTimeout);
						sliderTimeout = null;
						zoomTo(zoom);
					}
					
					function sliderHandler(){
						setZoomViaSlider();
					}
					
					function startSliding(){
						sliderMdown = true;
						
						zx = $container.width()/2;
						zy = $container.height()/2;

						sliderHandler();
						
						$(window).unbind("mousemove", sliderHandler);
						$(window).bind("mousemove", sliderHandler);
					}
					
					function doneSliding(){
						$(window).unbind("mousemove", sliderHandler);
						
						sliderMdown = false;
					}
					
					var sliderMdown = false;
					$slider.find(".ui-slider-handle").bind("mousedown", function(){
						startSliding();
					}).bind("mouseup", function(){
						doneSliding();
					});
					
					$slider.bind("mousedown", function(e){
						if( e.target != $slider.find(".ui-slider-handle")[0] ){ // update so long as not handle
							startSliding();
						}
					});
					
					$(window).bind("mouseup blur", function(){
						doneSliding();
					});
					
					var sliderTimeout;
					$container.cytoscape("get").bind("zoom", function(){ 
						if( sliderTimeout != null || sliderMdown ){
							return;
						}
						
						sliderTimeout = setTimeout(function(){
							var lvl = cy.zoom();
							var slider = zoom2slider(lvl);
							var percent = (slider - sliderMin) / (sliderMax - sliderMin);
							
							if( percent > 1 ){
								percent = 1;
							}
							
							if( percent < 0 ){
								percent = 0;
							}
							
							var property = options.staticPosition ? "bottom" : "left";
							
							$slider.find(".ui-slider-handle").css(property, (100 * percent) + "%");
							sliderTimeout = null;
						}, 10);
					});
					
					function slider2zoom(slider){
						return Math.pow( 10, slider/100 );
					}
					
					function zoom2slider(zoom){
						return Math.log(zoom) * 100 / Math.log(10);
					}
*/					
				


					// set up zoom in/out buttons
					/////////////////////////////

					var zoomInterval;
					function bindButton($button, factor){
						$button.bind("mousedown", function(e){
							e.preventDefault();
							e.stopPropagation();
							
							if( e.button != 0 ){
								return;
							}
							
							zx = $container.width()/2;
							zy = $container.height()/2;

							var cy = $container.cytoscape("get");
							
							zoomInterval = setInterval(function(){
								var zoom = cy.zoom();
								var lvl = cy.zoom() * factor;
								
								if( lvl < options.minZoom ){
									lvl = options.minZoom;
								}
								
								if( lvl > options.maxZoom ){
									lvl = options.maxZoom;
								}
								
								if( (lvl == options.maxZoom && zoom == options.maxZoom) ||
									(lvl == options.minZoom && zoom == options.minZoom)
								){
									return;
								}
								
								zoomTo(lvl);
							}, options.zoomDelay);
							
							return false;
						})
						
						$(window).bind("mouseup blur", function(){
							clearInterval(zoomInterval);
						});
					}
					
					bindButton( $zoomIn, (1 + options.zoomFactor) );
					bindButton( $zoomOut, (1 - options.zoomFactor) );
					
					$reset.bind("mousedown", function(e){
						if( e.button != 0 ){
							return;
						}
						
						var cy = $container.cytoscape("get");
						cy.fit();

						var length = Math.max( $container.width(), $container.height() );
						var zoom = cy.zoom() * (length - options.fitPadding*2)/length;

						cy.zoom({
							level: zoom,
							renderedPosition: {
								x: $container.width()/2,
								y: $container.height()/2
							}
						});

						return false;
					});
					
					
					
				});
			}
		};
		
		if( functions[fn] ){
			return functions[fn].apply(this, Array.prototype.slice.call( arguments, 1 ));
		} else if( typeof fn == 'object' || !fn ) {
			return functions.init.apply( this, arguments );
		} else {
			$.error("No such function `"+ fn +"` for jquery.cytoscapePanzoom");
		}
		
		return $(this);
	};
	
})(jQuery);