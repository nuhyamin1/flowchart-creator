// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const canvas = document.getElementById('flowchartCanvas');
const ctx = canvas.getContext('2d');
const toolbar = document.getElementById('toolbar');
const colorPicker = document.getElementById('colorPicker');
const savePngButton = document.getElementById('savePng');
const saveJpgButton = document.getElementById('saveJpg');

let shapes = []; // Array to hold all shape objects
let selectedShape = null;
let isDragging = false;
let dragOffsetX, dragOffsetY; // Offset from shape origin to mouse click
let currentShapeType = 'rectangle'; // Default shape
let currentColor = '#000000'; // Default color

// --- State variables for Line Drawing ---
let isDrawingLine = false;
let lineStartX, lineStartY;
let tempLineEndX, tempLineEndY;

// --- NEW State variables for Resizing ---
let isResizing = false;
let activeHandle = null; // Stores the type ('top-left', 'bottom-right', etc.) of the handle being dragged
const handleSize = 8; // Size of the square resize handles
let currentCursor = 'default'; // To manage cursor style changes

// --- Shape Classes --- (Keep Rectangle, Circle, Diamond, Line as before)
class Shape {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.id = Date.now() + Math.random(); // Simple unique ID
    }
    draw(ctx) { throw new Error("Draw method must be implemented"); }
    isInside(mouseX, mouseY) { throw new Error("isInside method must be implemented"); }
    // NEW: Method to get resize handles (returns array of handle objects)
    getHandles() { return []; } // Default: no handles
}

class Rectangle extends Shape {
    constructor(x, y, width, height, color) {
        super(x, y, color);
        this.width = Math.max(width, handleSize * 2); // Ensure minimum size
        this.height = Math.max(height, handleSize * 2); // Ensure minimum size
        this.type = 'rectangle';
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
    }

    isInside(mouseX, mouseY) {
        return mouseX >= this.x && mouseX <= this.x + this.width &&
               mouseY >= this.y && mouseY <= this.y + this.height;
    }

    getHandles() {
        const x = this.x;
        const y = this.y;
        const w = this.width;
        const h = this.height;
        const halfH = handleSize / 2;
        return [
            { x: x - halfH,         y: y - halfH,          type: 'top-left' },
            { x: x + w / 2 - halfH, y: y - halfH,          type: 'top-center' },
            { x: x + w - halfH,     y: y - halfH,          type: 'top-right' },
            { x: x - halfH,         y: y + h / 2 - halfH,  type: 'middle-left' },
            { x: x + w - halfH,     y: y + h / 2 - halfH,  type: 'middle-right' },
            { x: x - halfH,         y: y + h - halfH,      type: 'bottom-left' },
            { x: x + w / 2 - halfH, y: y + h - halfH,      type: 'bottom-center' },
            { x: x + w - halfH,     y: y + h - halfH,      type: 'bottom-right' },
        ];
    }
}

class Circle extends Shape {
    constructor(x, y, radius, color) {
        super(x, y, color); // x, y is center
        this.radius = Math.max(radius, handleSize); // Ensure minimum size
        this.type = 'circle';
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    isInside(mouseX, mouseY) {
        const dx = mouseX - this.x;
        const dy = mouseY - this.y;
        return dx * dx + dy * dy <= this.radius * this.radius;
    }

    // Circles typically resize uniformly, often just from corner handles conceptually
    getHandles() {
        const x = this.x;
        const y = this.y;
        const r = this.radius;
        const halfH = handleSize / 2;
         // Use bounding box for handles
        return [
            { x: x - r - halfH, y: y - r - halfH, type: 'top-left' },      // Top-left corner
            { x: x + r - halfH, y: y - r - halfH, type: 'top-right' },     // Top-right corner
            { x: x - r - halfH, y: y + r - halfH, type: 'bottom-left' },   // Bottom-left corner
            { x: x + r - halfH, y: y + r - halfH, type: 'bottom-right' },  // Bottom-right corner
             // Optional: Could add N, S, E, W handles too
             { x: x - halfH,     y: y - r - halfH, type: 'top-center' },    // Top-center
             { x: x - halfH,     y: y + r - halfH, type: 'bottom-center' }, // Bottom-center
             { x: x - r - halfH, y: y - halfH,     type: 'middle-left' },   // Middle-left
             { x: x + r - halfH, y: y - halfH,     type: 'middle-right' },  // Middle-right
        ];
    }
}

class Diamond extends Shape {
    constructor(x, y, width, height, color) {
        super(x, y, color); // x, y is top-left of bounding box
        this.width = Math.max(width, handleSize * 2);
        this.height = Math.max(height, handleSize * 2);
        this.type = 'diamond';
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y); // Top point
        ctx.lineTo(this.x + this.width, this.y + this.height / 2); // Right point
        ctx.lineTo(this.x + this.width / 2, this.y + this.height); // Bottom point
        ctx.lineTo(this.x, this.y + this.height / 2); // Left point
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    isInside(mouseX, mouseY) {
        // Basic bounding box check - sufficient for selection
        return mouseX >= this.x && mouseX <= this.x + this.width &&
               mouseY >= this.y && mouseY <= this.y + this.height;
    }

     // Use bounding box for handles, similar to Rectangle
    getHandles() {
        const x = this.x;
        const y = this.y;
        const w = this.width;
        const h = this.height;
        const halfH = handleSize / 2;
        return [
            { x: x - halfH,         y: y - halfH,          type: 'top-left' }, // BBox Top-Left
            { x: x + w / 2 - halfH, y: y - halfH,          type: 'top-center' },
            { x: x + w - halfH,     y: y - halfH,          type: 'top-right' }, // BBox Top-Right
            { x: x - halfH,         y: y + h / 2 - halfH,  type: 'middle-left' },
            { x: x + w - halfH,     y: y + h / 2 - halfH,  type: 'middle-right' },
            { x: x - halfH,         y: y + h - halfH,      type: 'bottom-left' }, // BBox Bottom-Left
            { x: x + w / 2 - halfH, y: y + h - halfH,      type: 'bottom-center' },
            { x: x + w - halfH,     y: y + h - halfH,      type: 'bottom-right' }, // BBox Bottom-Right
        ];
    }
}

class Line extends Shape {
    constructor(x1, y1, x2, y2, color) {
        super(x1, y1, color); // Base x,y is start point
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.type = 'line';
        // Store dx/dy for dragging the whole line easily
        this.dx = x2 - x1;
        this.dy = y2 - y1;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.moveTo(this.x1, this.y1);
        ctx.lineTo(this.x2, this.y2);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
    }

    isInside(mouseX, mouseY) {
        // ... (keep existing line isInside logic) ...
        const tolerance = 5;
        const dxL = this.x2 - this.x1;
        const dyL = this.y2 - this.y1;
        const lenSq = dxL * dxL + dyL * dyL;
        if (lenSq === 0) {
             const distSq = Math.pow(mouseX - this.x1, 2) + Math.pow(mouseY - this.y1, 2);
             return distSq <= tolerance * tolerance;
         }
        let t = ((mouseX - this.x1) * dxL + (mouseY - this.y1) * dyL) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const closestX = this.x1 + t * dxL;
        const closestY = this.y1 + t * dyL;
        const distSq = Math.pow(mouseX - closestX, 2) + Math.pow(mouseY - closestY, 2);
        return distSq <= tolerance * tolerance;
    }

    // Lines don't have resize handles in this implementation
    getHandles() {
        return [];
    }
}


// --- NEW Helper Function to get handle at mouse position ---
function getHandleAt(mouseX, mouseY) {
    if (!selectedShape) return null;

    const handles = selectedShape.getHandles();
    for (const handle of handles) {
        // Check if mouse is within the handle's bounds
        if (mouseX >= handle.x && mouseX <= handle.x + handleSize &&
            mouseY >= handle.y && mouseY <= handle.y + handleSize) {
            return handle.type; // Return the type ('top-left', etc.)
        }
    }
    return null; // No handle found at this position
}

// --- NEW Helper Function to get cursor for handle ---
function getCursorForHandle(handleType) {
    switch (handleType) {
        case 'top-left':
        case 'bottom-right':
            return 'nwse-resize';
        case 'top-right':
        case 'bottom-left':
            return 'nesw-resize';
        case 'top-center':
        case 'bottom-center':
            return 'ns-resize';
        case 'middle-left':
        case 'middle-right':
            return 'ew-resize';
        default:
            return 'move'; // Default for shape body
    }
}

// --- Canvas Redraw ---
function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    shapes.forEach(shape => {
        shape.draw(ctx);
    });

    if (isDrawingLine) {
        // ... (keep existing temporary line drawing logic) ...
        ctx.beginPath();
        ctx.moveTo(lineStartX, lineStartY);
        ctx.lineTo(tempLineEndX, tempLineEndY);
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
    }

    // Draw selection highlight and handles
    if (selectedShape) {
        // Draw main selection highlight (thicker or different color)
        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 2;
        if (selectedShape instanceof Rectangle) {
             ctx.strokeRect(selectedShape.x, selectedShape.y, selectedShape.width, selectedShape.height);
         } else if (selectedShape instanceof Circle) {
             ctx.beginPath();
             ctx.arc(selectedShape.x, selectedShape.y, selectedShape.radius, 0, Math.PI * 2);
             ctx.stroke();
         } else if (selectedShape instanceof Diamond) {
             // Re-draw diamond outline thicker/blue
             ctx.beginPath();
             ctx.moveTo(selectedShape.x + selectedShape.width / 2, selectedShape.y); // Top point
             ctx.lineTo(selectedShape.x + selectedShape.width, selectedShape.y + selectedShape.height / 2); // Right point
             ctx.lineTo(selectedShape.x + selectedShape.width / 2, selectedShape.y + selectedShape.height); // Bottom point
             ctx.lineTo(selectedShape.x, selectedShape.y + selectedShape.height / 2); // Left point
             ctx.closePath();
             ctx.stroke();
         } else if (selectedShape instanceof Line) {
            // Draw line highlight
            ctx.beginPath();
            ctx.moveTo(selectedShape.x1, selectedShape.y1);
            ctx.lineTo(selectedShape.x2, selectedShape.y2);
            // Stroke is already blue/thick from settings above
            ctx.stroke();
         }


        // --- NEW: Draw Resize Handles ---
        const handles = selectedShape.getHandles();
        if (handles.length > 0) {
             ctx.fillStyle = 'white'; // Handle fill color
             ctx.strokeStyle = 'black'; // Handle border color
             ctx.lineWidth = 1;
             handles.forEach(handle => {
                 ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
                 ctx.strokeRect(handle.x, handle.y, handleSize, handleSize);
             });
        }
        // -------------------------------

        // Reset styles
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
    }
}

// --- Event Listeners ---

// Toolbar shape selection (Mostly unchanged)
toolbar.addEventListener('click', (e) => {
    if (e.target.classList.contains('shape')) {
        if (isDrawingLine && e.target.getAttribute('data-shape') !== 'line') {
             isDrawingLine = false;
             redrawCanvas();
             console.log('Line drawing cancelled by switching tool.');
        }
        // Stop resizing if switching tool
        if (isResizing) {
            isResizing = false;
            activeHandle = null;
             console.log('Resizing cancelled by switching tool.');
        }

        document.querySelectorAll('.shape.selected').forEach(el => el.classList.remove('selected'));
        e.target.classList.add('selected');
        currentShapeType = e.target.getAttribute('data-shape');
        console.log(`Selected shape type: ${currentShapeType}`);
        selectedShape = null;
        redrawCanvas();
    }
});

// Color selection (Unchanged)
colorPicker.addEventListener('input', (e) => {
     currentColor = e.target.value;
     console.log(`Selected color: ${currentColor}`);
     if (selectedShape) {
         selectedShape.color = currentColor;
         redrawCanvas();
     }
 });

// --- MODIFIED Canvas Interaction ---
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    isDragging = false; // Reset flags
    isResizing = false;
    activeHandle = null;

    // Priority 1: Check if clicking on a resize handle of the selected shape
    if (selectedShape) {
        activeHandle = getHandleAt(mouseX, mouseY);
        if (activeHandle) {
            isResizing = true;
            // Store initial state for resizing calculations if needed (optional here, calculated in mousemove)
            console.log(`Start resizing using handle: ${activeHandle}`);
            // Bring selected shape to front (already done on selection usually)
            shapes.splice(shapes.indexOf(selectedShape), 1);
            shapes.push(selectedShape);
            redrawCanvas();
            return; // Don't proceed to other checks
        }
    }

    // Priority 2: Check if starting to draw a new line
    if (currentShapeType === 'line') {
        isDrawingLine = true;
        lineStartX = mouseX;
        lineStartY = mouseY;
        tempLineEndX = mouseX;
        tempLineEndY = mouseY;
        selectedShape = null; // Deselect any shape
        console.log(`Starting line at (${lineStartX}, ${lineStartY})`);
        redrawCanvas();
        return;
    }

    // Priority 3: Check if clicking on an existing shape to select/drag
    let clickedShape = null;
    // Iterate backwards to find the top-most shape
    for (let i = shapes.length - 1; i >= 0; i--) {
        const shape = shapes[i];
        if (shape.isInside(mouseX, mouseY)) {
            clickedShape = shape;
            break;
        }
    }

    if (clickedShape) {
        selectedShape = clickedShape;
        isDragging = true; // Start dragging the shape
        activeHandle = null; // Ensure not resizing
        isResizing = false;
        // Calculate drag offset
        dragOffsetX = mouseX - selectedShape.x; // Use base x for offset
        dragOffsetY = mouseY - selectedShape.y; // Use base y for offset
         // Store relative position for lines if dragging line
         if (selectedShape instanceof Line) {
             dragOffsetX = mouseX - selectedShape.x1;
             dragOffsetY = mouseY - selectedShape.y1;
             selectedShape.dx = selectedShape.x2 - selectedShape.x1;
             selectedShape.dy = selectedShape.y2 - selectedShape.y1;
         }

        // Bring selected shape to front
        shapes.splice(shapes.indexOf(selectedShape), 1);
        shapes.push(selectedShape);

        // Update color picker
        colorPicker.value = selectedShape.color;
        currentColor = selectedShape.color;

        console.log('Selected existing shape for dragging:', selectedShape);
        redrawCanvas();

    } else {
        // Priority 4: Clicked on background - Add new shape or deselect
        selectedShape = null; // Deselect first
        let newShape;
        const defaultWidth = 100;
        const defaultHeight = 60;
        const defaultRadius = 40;
        const shapeX = mouseX - defaultWidth / 2;
        const shapeY = mouseY - defaultHeight / 2;
        const circleCenterX = mouseX;
        const circleCenterY = mouseY;

        // Only add shape if a shape tool (not line) is selected
        if (currentShapeType !== 'line') {
             switch (currentShapeType) {
                 case 'rectangle':
                     newShape = new Rectangle(shapeX, shapeY, defaultWidth, defaultHeight, currentColor);
                     break;
                 case 'circle':
                     newShape = new Circle(circleCenterX, circleCenterY, defaultRadius, currentColor);
                     break;
                 case 'diamond':
                     newShape = new Diamond(shapeX, shapeY, defaultWidth, defaultHeight, currentColor);
                     break;
             }
             if (newShape) {
                 shapes.push(newShape);
                 selectedShape = newShape; // Select the new shape
                 console.log('Added new shape:', newShape);
             } else {
                 console.log('Clicked background, deselected shape.');
             }
        } else {
             // If line tool is active and clicked background, just deselect
             console.log('Clicked background with line tool, deselected shape.');
        }
        redrawCanvas();
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    let cursor = 'default'; // Default cursor

    // --- Handle Resizing ---
    if (isResizing && selectedShape && activeHandle) {
        const shape = selectedShape;
        const minSize = handleSize * 2; // Minimum width/height or radius

        // Store original values before modification
        const origX = shape.x;
        const origY = shape.y;
        let origW = shape.width;
        let origH = shape.height;
        let origR = shape.radius;
        if (shape instanceof Circle) {
             origW = shape.radius * 2; // Use diameter for consistent calculations
             origH = shape.radius * 2;
        }

        // Calculate new dimensions/position based on handle type
        switch (activeHandle) {
            case 'top-left':
                shape.width = Math.max(minSize, origX + origW - mouseX);
                shape.height = Math.max(minSize, origY + origH - mouseY);
                shape.x = origX + origW - shape.width;
                shape.y = origY + origH - shape.height;
                break;
            case 'top-center':
                 shape.height = Math.max(minSize, origY + origH - mouseY);
                 shape.y = origY + origH - shape.height;
                 break;
            case 'top-right':
                shape.width = Math.max(minSize, mouseX - origX);
                shape.height = Math.max(minSize, origY + origH - mouseY);
                //shape.x = origX; // X doesn't change
                shape.y = origY + origH - shape.height;
                 break;
            case 'middle-left':
                shape.width = Math.max(minSize, origX + origW - mouseX);
                shape.x = origX + origW - shape.width;
                //shape.y = origY; // Y doesn't change
                 break;
            case 'middle-right':
                shape.width = Math.max(minSize, mouseX - origX);
                 //shape.x = origX; // X doesn't change
                 //shape.y = origY; // Y doesn't change
                break;
            case 'bottom-left':
                shape.width = Math.max(minSize, origX + origW - mouseX);
                shape.height = Math.max(minSize, mouseY - origY);
                shape.x = origX + origW - shape.width;
                 //shape.y = origY; // Y doesn't change
                 break;
            case 'bottom-center':
                 shape.height = Math.max(minSize, mouseY - origY);
                 //shape.x = origX; // X doesn't change
                 //shape.y = origY; // Y doesn't change
                break;
            case 'bottom-right':
                 shape.width = Math.max(minSize, mouseX - origX);
                 shape.height = Math.max(minSize, mouseY - origY);
                 //shape.x = origX; // X doesn't change
                 //shape.y = origY; // Y doesn't change
                break;
        }

        // Specific handling for Circle: maintain center, adjust radius
        if (shape instanceof Circle) {
            // Calculate new radius based on the change in width/height, average them? Or use distance?
            // Let's use distance from center to mouse for corner handles
            const dx = mouseX - shape.x;
            const dy = mouseY - shape.y;
             let newRadius = shape.radius; // Default to original

            if (activeHandle.includes('left') || activeHandle.includes('right') || activeHandle.includes('top') || activeHandle.includes('bottom')) {
                 // More intuitive: calculate distance from center to mouse
                 newRadius = Math.sqrt(dx * dx + dy * dy);
             }
            // Simplified: Base on bounding box width/height changes (can distort slightly)
            // shape.radius = Math.max(minSize/2, (shape.width + shape.height) / 4);
             shape.radius = Math.max(minSize / 2, newRadius);

             // Circle x/y is center, it doesn't change during resize
             shape.x = origX;
             shape.y = origY;
        }

        cursor = getCursorForHandle(activeHandle);
        redrawCanvas();

    // --- Handle Shape Dragging ---
    } else if (isDragging && selectedShape) {
        const newX = mouseX - dragOffsetX;
        const newY = mouseY - dragOffsetY;
        if (selectedShape instanceof Line) {
             selectedShape.x1 = newX;
             selectedShape.y1 = newY;
             selectedShape.x2 = newX + selectedShape.dx;
             selectedShape.y2 = newY + selectedShape.dy;
             selectedShape.x = newX; // Update base x/y too
             selectedShape.y = newY;
         } else {
            selectedShape.x = newX;
            selectedShape.y = newY;
         }
        cursor = 'move';
        redrawCanvas();

    // --- Handle Line Drawing Preview ---
    } else if (isDrawingLine) {
        tempLineEndX = mouseX;
        tempLineEndY = mouseY;
        cursor = 'crosshair';
        redrawCanvas();

    // --- Handle Hovering (for cursor changes) ---
    } else {
        // Check if hovering over a handle
        const handleType = getHandleAt(mouseX, mouseY);
        if (handleType) {
            cursor = getCursorForHandle(handleType);
        } else {
            // Check if hovering over a shape
             let hoveredShape = null;
             for (let i = shapes.length - 1; i >= 0; i--) {
                 if (shapes[i].isInside(mouseX, mouseY)) {
                     hoveredShape = shapes[i];
                     break;
                 }
             }
             if (hoveredShape) {
                 cursor = 'move'; // Indicate shape is draggable
             } else if (currentShapeType === 'line') {
                 cursor = 'crosshair'; // For drawing new line
             } else {
                 cursor = 'default';
             }
        }
    }

    // Update canvas cursor style if it changed
    if (cursor !== currentCursor) {
         canvas.style.cursor = cursor;
         currentCursor = cursor;
     }
});

canvas.addEventListener('mouseup', (e) => {
    // Finalize resizing
    if (isResizing) {
        console.log('Finished resizing shape:', selectedShape);
        isResizing = false;
        activeHandle = null;
        redrawCanvas(); // Redraw without handles if mouse moved off canvas during resize
    }

    // Finalize dragging
    if (isDragging) {
        console.log('Finished dragging shape:', selectedShape);
        isDragging = false;
    }

    // Finalize line drawing
    if (isDrawingLine) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        if (lineStartX !== mouseX || lineStartY !== mouseY) {
            const newLine = new Line(lineStartX, lineStartY, mouseX, mouseY, currentColor);
            shapes.push(newLine);
            console.log('Added new line:', newLine);
             // selectedShape = newLine; // Optionally select
        } else {
             console.log('Line drawing cancelled (start=end).');
         }
        isDrawingLine = false;
        redrawCanvas();
    }

     // Ensure cursor resets if mouseup happens outside canvas or over UI elements
     canvas.style.cursor = 'default';
     currentCursor = 'default';
});

canvas.addEventListener('mouseleave', () => {
    // Cancel any ongoing drawing/dragging/resizing
    if (isDrawingLine) {
        isDrawingLine = false;
        console.log('Line drawing cancelled (mouse left canvas)');
        redrawCanvas();
    }
    if (isDragging) {
        isDragging = false;
        console.log('Dragging stopped (mouse left canvas)');
        redrawCanvas(); // May need redraw if shape position needs snapping back etc.
    }
    if (isResizing) {
        isResizing = false;
        activeHandle = null;
         console.log('Resizing cancelled (mouse left canvas)');
         redrawCanvas(); // Redraw without handles
    }
    // Reset cursor
    canvas.style.cursor = 'default';
    currentCursor = 'default';
});

// Delete selected shape (Unchanged)
document.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShape) {
        console.log('Deleting shape:', selectedShape);
        const index = shapes.indexOf(selectedShape);
        if (index > -1) {
            shapes.splice(index, 1);
        }
        selectedShape = null;
        if (isDrawingLine) {
             isDrawingLine = false;
             console.log("Line drawing cancelled by delete key.");
        }
         if (isResizing) {
             isResizing = false;
             activeHandle = null;
             console.log("Resizing cancelled by delete key.");
         }
        redrawCanvas();
    }
});


// --- Save Functionality --- (Keep existing save functions)
async function saveCanvasToFile(format) { /* ... unchanged ... */
    let dataURL;
    let filter;

    // Deselect shape before saving for a clean image
    const previouslySelected = selectedShape; // Store selection
    selectedShape = null;
    redrawCanvas(); // Redraw without selection highlight/handles

    if (format === 'png') { /* ... */ }
    else if (format === 'jpg') { /* ... */ }
    else { /* ... */ return; }

    try { /* ... */ }
    catch (error) { /* ... */ }
    finally {
        // Reselect shape if it was selected before saving
        selectedShape = previouslySelected;
        redrawCanvas();
    }
}

savePngButton.addEventListener('click', () => { saveCanvasToFile('png'); });
saveJpgButton.addEventListener('click', () => { saveCanvasToFile('jpg'); });


// --- Initial Draw ---
canvas.style.backgroundColor = '#f0f0f0';
colorPicker.value = currentColor;
redrawCanvas();
console.log('Renderer process loaded.');
document.querySelector('.shape[data-shape="rectangle"]').classList.add('selected');