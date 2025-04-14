// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const canvas = document.getElementById('flowchartCanvas');
const ctx = canvas.getContext('2d');
const toolbar = document.getElementById('toolbar');
const colorPicker = document.getElementById('colorPicker');
const removeColorButton = document.getElementById('removeColorButton');
// --- NEW: Text Formatting Elements ---
const fontSelector = document.getElementById('fontSelector');
const boldButton = document.getElementById('boldButton');
const italicButton = document.getElementById('italicButton');
const underlineButton = document.getElementById('underlineButton');
const alignLeftButton = document.getElementById('alignLeftButton');
const alignCenterButton = document.getElementById('alignCenterButton');
const alignRightButton = document.getElementById('alignRightButton');
// ------------------------------------

let shapes = []; // Array to hold all shape objects
let history = []; // For Undo/Redo
let redoStack = []; // For Undo/Redo
let historyIndex = -1; // Current position in history
let selectedShape = null;
let isDragging = false;
let dragOffsetX, dragOffsetY; // Offset from shape origin to mouse click
let currentShapeType = 'rectangle'; // Default shape
let currentColor = null; // Default color (null means no fill)

// --- State variables for Line Drawing ---
let isDrawingLine = false;
let lineStartX, lineStartY;
let tempLineEndX, tempLineEndY;

// --- State variables for Resizing ---
let isResizing = false;
// --- NEW State variables for Rotating ---
let isRotating = false;
let rotationStartAngle = 0; // Initial angle between center and mouse on mousedown
let shapeCenter = null; // Center of the shape being rotated

let activeHandle = null; // Stores the type ('top-left', 'rotation', etc.) of the handle being dragged
const handleSize = 8; // Size of the square resize handles
let currentCursor = 'default'; // To manage cursor style changes
let activeTextInput = null; // Reference to the currently active text input element
let initialMouseDownPos = null; // Store mouse position on mousedown
const dragThreshold = 3; // Pixels mouse must move to initiate drag


// --- Helper Function to Set Active Tool ---
function setActiveTool(toolType) {
    currentShapeType = toolType;
    console.log(`Selected shape type: ${toolType}`);

    // Update toolbar UI
    document.querySelectorAll('#toolbar .shape.selected').forEach(el => el.classList.remove('selected'));
    const toolButton = document.querySelector(`#toolbar .shape[data-shape="${toolType}"]`);
    if (toolButton) {
        toolButton.classList.add('selected');
    } else {
        console.warn(`Toolbar button for tool type "${toolType}" not found.`);
    }

    // Update cursor based on tool
    if (toolType === 'rectangle' || toolType === 'circle' || toolType === 'diamond' || toolType === 'line') {
        canvas.style.cursor = 'crosshair';
        currentCursor = 'crosshair';
    } else if (toolType === 'text') { // NEW: Text tool cursor
        canvas.style.cursor = 'text';
        currentCursor = 'text';
    } else { // default or other tools
        canvas.style.cursor = 'default';
        currentCursor = 'default';
    }

    // Deselect shape if switching to a drawing tool or default
    if (toolType !== 'default' || selectedShape) {
        selectedShape = null;
        redrawCanvas(); // Redraw to remove selection highlights
    }

    // Cancel ongoing actions if switching tool
    if (isDrawingLine && toolType !== 'line') {
        isDrawingLine = false;
        redrawCanvas();
        console.log('Line drawing cancelled by switching tool.');
    }
    if (isResizing) {
        isResizing = false;
        activeHandle = null;
        console.log('Resizing cancelled by switching tool.');
    }
    // NEW: Cancel rotation on tool switch
    if (isRotating) {
        isRotating = false;
        activeHandle = null;
        console.log('Rotation cancelled by switching tool.');
    }
}


// --- Shape Classes --- (Keep Rectangle, Circle, Diamond, Line as before)
class Shape {
    constructor(x, y, color) {
        this.x = x; // Typically top-left for rect/diamond, center for circle
        this.y = y;
        this.color = color;
        this.angle = 0; // NEW: Rotation angle in radians
        this.id = Date.now() + Math.random(); // Simple unique ID
    }
    // Abstract methods
    draw(ctx) { throw new Error("Draw method must be implemented"); }
    isInside(mouseX, mouseY) { throw new Error("isInside method must be implemented"); }
    // NEW: Method to get resize handles (returns array of handle objects)
    getHandles() { return []; } // Default: no handles

    // Helper for deep cloning shapes for history
    clone() {
        // Basic clone, ensure subclasses override if they have non-primitive properties
        const cloned = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
        // Ensure angle is copied (it's primitive, so Object.assign works, but good practice)
        cloned.angle = this.angle;
        return cloned;
    }

    // NEW: Helper to get center coordinates (needed for rotation)
    getCenter() {
        // Default implementation (e.g., for point-like shapes if any)
        // Subclasses like Rectangle, Circle, Diamond MUST override this.
        return { x: this.x, y: this.y };
    }
}

class Rectangle extends Shape {
    constructor(x, y, width, height, color) {
        super(x, y, color);
        this.width = Math.max(width, handleSize * 2); // Ensure minimum size
        this.height = Math.max(height, handleSize * 2); // Ensure minimum size
        this.type = 'rectangle';
    }

    getCenter() {
        return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
    }

    draw(ctx) {
        const center = this.getCenter();
        ctx.save(); // Save context state
        ctx.translate(center.x, center.y); // Translate to center
        ctx.rotate(this.angle); // Rotate
        ctx.translate(-center.x, -center.y); // Translate back

        // Draw relative to original top-left (this.x, this.y)
        // Only fill if color is not null
        if (this.color) {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
        ctx.strokeStyle = '#000000'; // Always draw border
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x, this.y, this.width, this.height);

        ctx.restore(); // Restore context state
    }

    isInside(mouseX, mouseY) {
        // TODO: Improve this for rotated shapes. Currently uses axis-aligned bounding box.
        // For now, keep the simple check. Accurate check requires transforming mouse coords.
        return mouseX >= this.x && mouseX <= this.x + this.width &&
               mouseY >= this.y && mouseY <= this.y + this.height;
    }

    getHandles() {
        const center = this.getCenter();
        const angle = this.angle;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        const handleOffset = handleSize / 2;
        const rotationHandleOffset = 20; // Distance above the top-center handle

        // Calculate unrotated handle positions relative to center
        const unrotatedHandles = [
            { relX: -halfW, relY: -halfH, type: 'top-left' },
            { relX: 0,     relY: -halfH, type: 'top-center' },
            { relX: halfW, relY: -halfH, type: 'top-right' },
            { relX: -halfW, relY: 0,      type: 'middle-left' },
            { relX: halfW, relY: 0,      type: 'middle-right' },
            { relX: -halfW, relY: halfH, type: 'bottom-left' },
            { relX: 0,     relY: halfH, type: 'bottom-center' },
            { relX: halfW, relY: halfH, type: 'bottom-right' },
            // Rotation handle (relative position above top-center)
            { relX: 0,     relY: -halfH - rotationHandleOffset, type: 'rotation' }
        ];

        // Rotate each handle position around the center
        return unrotatedHandles.map(handle => {
            const rotatedX = handle.relX * cos - handle.relY * sin;
            const rotatedY = handle.relX * sin + handle.relY * cos;
            return {
                x: center.x + rotatedX - handleOffset, // Adjust for handle size
                y: center.y + rotatedY - handleOffset, // Adjust for handle size
                type: handle.type
            };
        });
    }
}

class Circle extends Shape {
    constructor(x, y, radius, color) {
        super(x, y, color); // x, y is center
        this.radius = Math.max(radius, handleSize); // Ensure minimum size
        this.type = 'circle';
    }

    // Circle's x, y IS the center
    getCenter() {
        return { x: this.x, y: this.y };
    }

    draw(ctx) {
        const center = this.getCenter(); // Which is just { x: this.x, y: this.y }
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(this.angle); // Circles look the same rotated, but handles will rotate
        ctx.translate(-center.x, -center.y);

        // Draw centered at original this.x, this.y
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        // Only fill if color is not null
        if (this.color) {
            ctx.fillStyle = this.color;
            ctx.fill();
        }
        ctx.strokeStyle = '#000000'; // Always draw border
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    isInside(mouseX, mouseY) {
        // Rotation doesn't affect circle's isInside check based on center distance
        const dx = mouseX - this.x;
        const dy = mouseY - this.y;
        return dx * dx + dy * dy <= this.radius * this.radius;
    }

    // Circles typically resize uniformly. Handles are on the bounding box.
    getHandles() {
        const center = this.getCenter(); // which is { x: this.x, y: this.y }
        const angle = this.angle; // Angle matters for handle positions even if circle looks same
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const r = this.radius;
        const handleOffset = handleSize / 2;
        const rotationHandleOffset = 20; // Distance above the top handle

        // Calculate unrotated handle positions relative to center (using bounding box)
        const unrotatedHandles = [
            { relX: -r, relY: -r, type: 'top-left' },
            { relX: 0,  relY: -r, type: 'top-center' },
            { relX: r,  relY: -r, type: 'top-right' },
            { relX: -r, relY: 0,  type: 'middle-left' },
            { relX: r,  relY: 0,  type: 'middle-right' },
            { relX: -r, relY: r,  type: 'bottom-left' },
            { relX: 0,  relY: r,  type: 'bottom-center' },
            { relX: r,  relY: r,  type: 'bottom-right' },
            // Rotation handle (relative position above top-center)
            { relX: 0,  relY: -r - rotationHandleOffset, type: 'rotation' }
        ];

        // Rotate each handle position around the center
        return unrotatedHandles.map(handle => {
            const rotatedX = handle.relX * cos - handle.relY * sin;
            const rotatedY = handle.relX * sin + handle.relY * cos;
            return {
                x: center.x + rotatedX - handleOffset, // Adjust for handle size
                y: center.y + rotatedY - handleOffset, // Adjust for handle size
                type: handle.type
            };
        });
    }
}

class Diamond extends Shape {
    constructor(x, y, width, height, color) {
        super(x, y, color); // x, y is top-left of bounding box
        this.width = Math.max(width, handleSize * 2);
        this.height = Math.max(height, handleSize * 2);
        this.type = 'diamond';
    }

    getCenter() {
        return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
    }

    draw(ctx) {
        const center = this.getCenter();
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(this.angle);
        ctx.translate(-center.x, -center.y);

        // Draw relative to original top-left (this.x, this.y)
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y); // Top point
        ctx.lineTo(this.x + this.width, this.y + this.height / 2); // Right point
        ctx.lineTo(this.x + this.width / 2, this.y + this.height); // Bottom point
        ctx.lineTo(this.x, this.y + this.height / 2); // Left point
        ctx.closePath();
        // Only fill if color is not null
        if (this.color) {
            ctx.fillStyle = this.color;
            ctx.fill();
        }
        ctx.strokeStyle = '#000000'; // Always draw border
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }

    isInside(mouseX, mouseY) {
        // TODO: Improve this for rotated shapes. Currently uses axis-aligned bounding box.
        // For now, keep the simple check. Accurate check requires transforming mouse coords.
        return mouseX >= this.x && mouseX <= this.x + this.width &&
               mouseY >= this.y && mouseY <= this.y + this.height;
    }

     // Use bounding box for handles, similar to Rectangle
    getHandles() {
        // Same logic as Rectangle, using bounding box width/height
        const center = this.getCenter();
        const angle = this.angle;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        const handleOffset = handleSize / 2;
        const rotationHandleOffset = 20; // Distance above the top-center handle

        // Calculate unrotated handle positions relative to center
        const unrotatedHandles = [
            { relX: -halfW, relY: -halfH, type: 'top-left' },
            { relX: 0,     relY: -halfH, type: 'top-center' },
            { relX: halfW, relY: -halfH, type: 'top-right' },
            { relX: -halfW, relY: 0,      type: 'middle-left' },
            { relX: halfW, relY: 0,      type: 'middle-right' },
            { relX: -halfW, relY: halfH, type: 'bottom-left' },
            { relX: 0,     relY: halfH, type: 'bottom-center' },
            { relX: halfW, relY: halfH, type: 'bottom-right' },
            // Rotation handle (relative position above top-center)
            { relX: 0,     relY: -halfH - rotationHandleOffset, type: 'rotation' }
        ];

        // Rotate each handle position around the center
        return unrotatedHandles.map(handle => {
            const rotatedX = handle.relX * cos - handle.relY * sin;
            const rotatedY = handle.relX * sin + handle.relY * cos;
            return {
                x: center.x + rotatedX - handleOffset, // Adjust for handle size
                y: center.y + rotatedY - handleOffset, // Adjust for handle size
                type: handle.type
            };
        });
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

    clone() {
        const cloned = super.clone(); // Call base clone
        cloned.x1 = this.x1;
        cloned.y1 = this.y1;
        cloned.x2 = this.x2;
        cloned.y2 = this.y2;
        cloned.dx = this.dx;
        cloned.dy = this.dy;
        // Lines don't have angle property used in this implementation
        delete cloned.angle;
        return cloned;
    }
} // Correctly close the Line class

class Text extends Shape {
    constructor(x, y, text, color, fontSize = 16, fontFamily = 'Arial', fontWeight = 'normal', fontStyle = 'normal', textDecoration = 'none', textAlign = 'left') {
        super(x, y, color || '#000000'); // Default text color to black if none provided
        this.text = text;
        this.fontSize = fontSize;
        this.fontFamily = fontFamily;
        this.fontWeight = fontWeight; // 'normal', 'bold'
        this.fontStyle = fontStyle;   // 'normal', 'italic'
        this.textDecoration = textDecoration; // 'none', 'underline'
        this.textAlign = textAlign; // 'left', 'center', 'right'
        this.type = 'text';
        // Calculate initial width/height for isInside checks (approximate)
        this.updateDimensions();
    }

    // Helper to update width/height based on text content and font
    updateDimensions() {
        // Construct font string with style and weight
        ctx.font = `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
        const metrics = ctx.measureText(this.text);
        this.width = metrics.width;
        // Approximate height based on font size
        this.height = this.fontSize; // Keep this simple for now
    }

    getCenter() {
        // Center based on calculated width/height
        return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
    }

    draw(ctx) {
        // Text doesn't rotate in this simple implementation
        ctx.fillStyle = this.color;
        // Construct font string with style and weight
        ctx.font = `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
        ctx.textAlign = this.textAlign; // Use the shape's alignment property
        ctx.textBaseline = 'top'; // Render text starting from the top-left corner (this.x, this.y)

        // Adjust draw position based on alignment
        let drawX = this.x;
        if (this.textAlign === 'center') {
            drawX = this.x + this.width / 2;
        } else if (this.textAlign === 'right') {
            drawX = this.x + this.width;
        }

        ctx.fillText(this.text, drawX, this.y);

        // --- Manual Underline ---
        if (this.textDecoration === 'underline') {
            // Recalculate dimensions just in case (might be redundant if updateDimensions called recently)
            // this.updateDimensions(); // Let's assume dimensions are up-to-date from resize/creation
            ctx.strokeStyle = this.color; // Use text color for underline
            ctx.lineWidth = Math.max(1, Math.floor(this.fontSize / 16)); // Basic underline thickness scaling

            let lineY = this.y + this.height + 1; // Position slightly below baseline (top + height)
            let lineStartX = this.x;
            let lineEndX = this.x + this.width;

            // Adjust underline position based on alignment
            if (this.textAlign === 'center') {
                // For center, the underline should span the actual text width, centered within the box
                // Re-measure text with current settings to get precise width
                ctx.font = `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
                const metrics = ctx.measureText(this.text);
                const textWidth = metrics.width;
                lineStartX = this.x + (this.width - textWidth) / 2;
                lineEndX = lineStartX + textWidth;
            } else if (this.textAlign === 'right') {
                 // For right, the underline should span the actual text width, aligned right
                 ctx.font = `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px ${this.fontFamily}`;
                 const metrics = ctx.measureText(this.text);
                 const textWidth = metrics.width;
                 lineStartX = this.x + this.width - textWidth;
                 lineEndX = this.x + this.width;
            }
            // For 'left', it's already correct (this.x to this.x + this.width)

            ctx.beginPath();
            ctx.moveTo(lineStartX, lineY);
            ctx.lineTo(lineEndX, lineY);
            ctx.stroke();
            ctx.lineWidth = 1; // Reset line width
        }
        // --- End Manual Underline ---
    }

    isInside(mouseX, mouseY) {
        // Simple bounding box check based on calculated dimensions
        return mouseX >= this.x && mouseX <= this.x + this.width &&
               mouseY >= this.y && mouseY <= this.y + this.height;
    }

    // Return handles based on the bounding box, similar to Rectangle but without rotation handle/logic
    getHandles() {
        const handleOffset = handleSize / 2;
        // Text doesn't rotate, so angle is 0
        const x = this.x;
        const y = this.y;
        const w = this.width;
        const h = this.height;

        // Calculate handle positions directly (no rotation needed)
        return [
            { x: x - handleOffset,       y: y - handleOffset,       type: 'top-left' },
            { x: x + w / 2 - handleOffset, y: y - handleOffset,       type: 'top-center' },
            { x: x + w - handleOffset,     y: y - handleOffset,       type: 'top-right' },
            { x: x - handleOffset,       y: y + h / 2 - handleOffset, type: 'middle-left' },
            { x: x + w - handleOffset,     y: y + h / 2 - handleOffset, type: 'middle-right' },
            { x: x - handleOffset,       y: y + h - handleOffset,     type: 'bottom-left' },
            { x: x + w / 2 - handleOffset, y: y + h - handleOffset,     type: 'bottom-center' },
            { x: x + w - handleOffset,     y: y + h - handleOffset,     type: 'bottom-right' },
            // No rotation handle for text
        ];
    }

    clone() {
        const cloned = super.clone();
        cloned.text = this.text;
        cloned.fontSize = this.fontSize;
        cloned.fontFamily = this.fontFamily;
        cloned.width = this.width;
        cloned.height = this.height;
        // --- NEW: Clone text style properties ---
        cloned.fontWeight = this.fontWeight;
        cloned.fontStyle = this.fontStyle;
        cloned.textDecoration = this.textDecoration;
        cloned.textAlign = this.textAlign;
        // ---------------------------------------
        delete cloned.angle; // Text doesn't use angle property
        return cloned;
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
        case 'rotation':
            // Use 'grabbing' if currently rotating, 'grab' otherwise
            return isRotating ? 'grabbing' : 'grab';
        default:
            // If dragging the shape body, use 'grabbing', otherwise 'move'
            return isDragging ? 'grabbing' : 'move';
    }
}

// --- Undo/Redo Functions ---
function saveState() {
    // Clear redo stack whenever a new action is taken
    redoStack = [];
    // Deep copy the current shapes array
    const currentState = shapes.map(shape => shape.clone());
    // Remove future states if we undid previously
    history = history.slice(0, historyIndex + 1);
    // Add the new state
    history.push(currentState);
    historyIndex++;
    // updateUndoRedoButtons(); // Removed call
    console.log(`State saved. History length: ${history.length}, Index: ${historyIndex}`);
}

function undo() {
    if (historyIndex <= 0) {
        console.log("Cannot undo further.");
        return; // Nothing to undo or only initial state left
    }
    // Move current state to redo stack (deep copy)
    const currentStateForRedo = shapes.map(shape => shape.clone());
    redoStack.push(currentStateForRedo);

    // Go back one step in history
    historyIndex--;
    // Restore the previous state (deep copy)
    shapes = history[historyIndex].map(shapeData => shapeData.clone()); // Need to clone again when restoring
    selectedShape = null; // Deselect after undo/redo
    redrawCanvas();
    // updateUndoRedoButtons(); // Removed call
    console.log(`Undo performed. History index: ${historyIndex}`);
}

function redo() {
    if (redoStack.length === 0) {
        console.log("Cannot redo.");
        return; // Nothing to redo
    }
    // Move current state back to history (deep copy)
    const currentStateForHistory = shapes.map(shape => shape.clone());
    // Ensure history is correctly sliced if we were at an earlier point
    history = history.slice(0, historyIndex + 1);
    history.push(currentStateForHistory);
    historyIndex++;


    // Restore the next state from redo stack (deep copy)
    const nextState = redoStack.pop();
    shapes = nextState.map(shapeData => shapeData.clone()); // Need to clone again when restoring
    selectedShape = null; // Deselect after undo/redo
    redrawCanvas();
    // updateUndoRedoButtons(); // Removed call
    console.log(`Redo performed. History index: ${historyIndex}`);
}

// Removed updateUndoRedoButtons function


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
        const center = selectedShape.getCenter();
        const angle = selectedShape.angle;

        // --- Draw Rotated Selection Highlight ---
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(angle);
        ctx.translate(-center.x, -center.y);

        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]); // Optional: Dashed line for selection

        if (selectedShape instanceof Rectangle) {
             ctx.strokeRect(selectedShape.x, selectedShape.y, selectedShape.width, selectedShape.height);
         } else if (selectedShape instanceof Circle) {
             ctx.beginPath();
             // Draw the circle centered at its x,y (which is its center)
             ctx.arc(selectedShape.x, selectedShape.y, selectedShape.radius, 0, Math.PI * 2);
             ctx.stroke();
         } else if (selectedShape instanceof Diamond) {
             // Draw diamond outline relative to its top-left (x,y)
             ctx.beginPath();
             ctx.moveTo(selectedShape.x + selectedShape.width / 2, selectedShape.y); // Top point
             ctx.lineTo(selectedShape.x + selectedShape.width, selectedShape.y + selectedShape.height / 2); // Right point
             ctx.lineTo(selectedShape.x + selectedShape.width / 2, selectedShape.y + selectedShape.height); // Bottom point
             ctx.lineTo(selectedShape.x, selectedShape.y + selectedShape.height / 2); // Left point
              ctx.closePath();
              ctx.stroke();
          } else if (selectedShape instanceof Text) { // NEW: Highlight for Text
              // Text doesn't rotate, so no need for save/restore/rotate here
              // Draw highlight based on calculated width/height
              ctx.strokeRect(selectedShape.x, selectedShape.y, selectedShape.width, selectedShape.height);
          }
          // Lines don't have a separate highlight drawn here, their main draw is sufficient.
          // We could add endpoint markers if desired.

         // Restore context only if we saved it (for shapes that rotate)
         if (!(selectedShape instanceof Text) && !(selectedShape instanceof Line)) {
            ctx.restore();
         }
        ctx.setLineDash([]); // Reset line dash
        // --- End Rotated Selection Highlight ---


        // --- Draw Handles (already correctly positioned) ---
        const handles = selectedShape.getHandles();
        // --- DEBUG LOG ---
        if (selectedShape instanceof Text) {
            console.log("Drawing handles for Text:", selectedShape.text, "Handles:", handles);
        }
        // --- END DEBUG LOG ---
        if (handles.length > 0) {
             ctx.fillStyle = 'white'; // Handle fill color
             ctx.strokeStyle = 'black'; // Handle border color
             ctx.lineWidth = 1;
             handles.forEach(handle => {
                 if (handle.type === 'rotation') {
                     // Draw rotation handle as a circle
                     ctx.beginPath();
                     ctx.arc(handle.x + handleSize / 2, handle.y + handleSize / 2, handleSize / 1.5, 0, Math.PI * 2);
                     ctx.fillStyle = 'lightblue';
                     ctx.fill();
                     ctx.stroke();
                 } else {
                     // Draw resize handles as squares
                     ctx.fillStyle = 'white';
                     ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
                     ctx.strokeRect(handle.x, handle.y, handleSize, handleSize);
                 }
             });
        }
        // -------------------------------

        // Reset styles
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
    }
}

// --- Event Listeners ---

// Toolbar shape selection
toolbar.addEventListener('click', (e) => {
    // Use closest to find the .shape element, even if the click is on the img inside it
    const shapeButton = e.target.closest('.shape');
    if (shapeButton) { // Check if a shape button was found
        const toolType = shapeButton.getAttribute('data-shape');
        if (toolType) { // Ensure it has the data-shape attribute
            setActiveTool(toolType);
        }
    }
});

// Color selection
colorPicker.addEventListener('input', (e) => {
     const newColor = e.target.value;
     currentColor = newColor; // Update the global current color for future shapes
     console.log(`Selected color: ${newColor}`);
     if (selectedShape && !(selectedShape instanceof Line)) { // Apply color to selected shape (if not a line)
         selectedShape.color = newColor;
         redrawCanvas();
         saveState(); // Save state after color change
     }
 });

// Remove color button listener
removeColorButton.addEventListener('click', () => {
    if (selectedShape && !(selectedShape instanceof Line)) {
        console.log('Removing fill color from selected shape.');
        selectedShape.color = null; // Set shape color to null (no fill)
        currentColor = null; // Set the global current color to null as well
        colorPicker.value = '#000000'; // Reset picker display to black
        redrawCanvas();
        saveState(); // Save the state change
    } else {
        console.log('No fillable shape selected to remove color from.');
    }
});

// --- NEW: Event Listeners for Text Formatting Controls ---

// Font selection
fontSelector.addEventListener('change', (e) => {
    if (selectedShape instanceof Text) {
        selectedShape.fontFamily = e.target.value;
        selectedShape.updateDimensions(); // Recalculate width/height
        redrawCanvas();
        saveState();
        console.log(`Set font family to: ${e.target.value}`);
    }
});

// Bold button
boldButton.addEventListener('click', () => {
    if (selectedShape instanceof Text) {
        selectedShape.fontWeight = selectedShape.fontWeight === 'bold' ? 'normal' : 'bold';
        boldButton.classList.toggle('selected', selectedShape.fontWeight === 'bold'); // Update button style
        selectedShape.updateDimensions();
        redrawCanvas();
        saveState();
        console.log(`Set font weight to: ${selectedShape.fontWeight}`);
    }
});

// Italic button
italicButton.addEventListener('click', () => {
    if (selectedShape instanceof Text) {
        selectedShape.fontStyle = selectedShape.fontStyle === 'italic' ? 'normal' : 'italic';
        italicButton.classList.toggle('selected', selectedShape.fontStyle === 'italic'); // Update button style
        selectedShape.updateDimensions();
        redrawCanvas();
        saveState();
        console.log(`Set font style to: ${selectedShape.fontStyle}`);
    }
});

// Underline button
underlineButton.addEventListener('click', () => {
    if (selectedShape instanceof Text) {
        selectedShape.textDecoration = selectedShape.textDecoration === 'underline' ? 'none' : 'underline';
        underlineButton.classList.toggle('selected', selectedShape.textDecoration === 'underline'); // Update button style
        // No dimension update needed for underline, just redraw
        redrawCanvas();
        saveState();
        console.log(`Set text decoration to: ${selectedShape.textDecoration}`);
    }
});

// Alignment buttons
[alignLeftButton, alignCenterButton, alignRightButton].forEach(button => {
    button.addEventListener('click', (e) => {
        if (selectedShape instanceof Text) {
            const newAlign = e.target.getAttribute('data-align');
            selectedShape.textAlign = newAlign;

            // Update button styles
            document.querySelectorAll('.align-button.selected').forEach(btn => btn.classList.remove('selected'));
            e.target.classList.add('selected');

            // No dimension update needed for alignment, just redraw
            redrawCanvas();
            saveState();
            console.log(`Set text align to: ${newAlign}`);
        }
    });
});

// --- END: Text Formatting Listeners ---


// --- MODIFIED Canvas Interaction ---
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    isDragging = false; // Reset flags
    isResizing = false;
    isRotating = false; // Reset rotation flag
    activeHandle = null;
    shapeCenter = null;
    initialMouseDownPos = { x: mouseX, y: mouseY }; // Store initial position for drag threshold check

    // Priority 1: Check if clicking on a handle (resize or rotation) of the selected shape
    if (selectedShape) {
        activeHandle = getHandleAt(mouseX, mouseY);
        if (activeHandle) {
            initialMouseDownPos = null; // Don't check for drag threshold if starting on a handle
            // Bring selected shape to front
            shapes.splice(shapes.indexOf(selectedShape), 1);
            shapes.push(selectedShape);

            if (activeHandle === 'rotation') {
                isRotating = true;
                isResizing = false; // Ensure not resizing
                shapeCenter = selectedShape.getCenter();
                // Calculate initial angle from center to mouse
                const dx = mouseX - shapeCenter.x;
                const dy = mouseY - shapeCenter.y;
                rotationStartAngle = Math.atan2(dy, dx);
                console.log(`Start rotating. Center: (${shapeCenter.x.toFixed(1)}, ${shapeCenter.y.toFixed(1)}), Start Angle: ${rotationStartAngle.toFixed(2)}`);
                canvas.style.cursor = getCursorForHandle('rotation'); // Set grabbing cursor immediately
                currentCursor = canvas.style.cursor;

            } else { // It's a resize handle
                isResizing = true;
                isRotating = false; // Ensure not rotating
                console.log(`Start resizing using handle: ${activeHandle}`);
                // --- Store initial state for resize ---
                selectedShape.initialX = selectedShape.x;
                selectedShape.initialY = selectedShape.y;
                selectedShape.initialWidth = selectedShape.width;
                selectedShape.initialHeight = selectedShape.height;
                selectedShape.initialRadius = selectedShape.radius; // For circles
                selectedShape.initialAngle = selectedShape.angle;
                selectedShape.initialCenter = selectedShape.getCenter();
                selectedShape.initialMouseX = mouseX;
                selectedShape.initialMouseY = mouseY;
                // --- NEW: Store initial font size for text ---
                if (selectedShape instanceof Text) {
                    selectedShape.initialFontSize = selectedShape.fontSize;
                }
                // ------------------------------------
            }

            redrawCanvas(); // Redraw needed for potential cursor change
            return; // Don't proceed to other checks
        }
    }

    // Priority 2: Check if starting to draw a new line
    if (currentShapeType === 'line') {
        initialMouseDownPos = null; // Not dragging a shape
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
        // isDragging = true; // Don't start dragging immediately
        // initialMouseDownPos is already set above
        activeHandle = null; // Ensure not resizing or rotating via handle
        isResizing = false;
        isRotating = false;
        // Calculate drag offset // MOVED to mousemove

        // Bring selected shape to front
        shapes.splice(shapes.indexOf(selectedShape), 1);
        shapes.push(selectedShape);

         // Update color picker to show the shape's color, or black if it has no fill
         colorPicker.value = selectedShape.color || '#000000';
         // Don't update currentColor here, only when picker is used or shape created

         // --- NEW: Update text format controls if a Text shape is selected ---
         if (selectedShape instanceof Text) {
             fontSelector.value = selectedShape.fontFamily;
             boldButton.classList.toggle('selected', selectedShape.fontWeight === 'bold');
             italicButton.classList.toggle('selected', selectedShape.fontStyle === 'italic');
             underlineButton.classList.toggle('selected', selectedShape.textDecoration === 'underline');
             document.querySelectorAll('.align-button.selected').forEach(btn => btn.classList.remove('selected'));
             document.querySelector(`.align-button[data-align="${selectedShape.textAlign}"]`)?.classList.add('selected');
         }
         // --------------------------------------------------------------------

          console.log('Selected existing shape:', selectedShape); // Log message updated
          redrawCanvas(); // Restore redraw here to show selection immediately

      } else {
        // Priority 4: Clicked on background - Add new shape or deselect
        initialMouseDownPos = null; // Not dragging a shape
        selectedShape = null; // Deselect first
        let newShape;
        const defaultWidth = 100;
        const defaultHeight = 60;
        const defaultRadius = 40;
        const shapeX = mouseX - defaultWidth / 2;
        const shapeY = mouseY - defaultHeight / 2;
        const circleCenterX = mouseX;
        const circleCenterY = mouseY;

        // Only add shape if a shape tool (not line, text, or default) is selected
        if (currentShapeType !== 'line' && currentShapeType !== 'default' && currentShapeType !== 'text') {
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
                 console.log('Added new shape:', newShape);
                 saveState(); // Save state after adding shape
                 setActiveTool('default'); // Reset tool to default after creating shape
             }
        } else if (currentShapeType === 'text' && !activeTextInput) { // Only start if text tool active and no input already exists
            // NEW: Handle text tool click - Start inline text input
            console.log(`Starting text input at (${mouseX}, ${mouseY})`);
            redrawCanvas(); // Redraw first to clear any selections
            startTextInput(mouseX, mouseY);
            e.stopPropagation(); // Prevent this click from interfering with input focus
            // Don't redraw or save state yet, wait for input completion
        } else {
             // If line or default tool is active and clicked background, just deselect
             console.log(`Clicked background with ${currentShapeType} tool, deselected shape.`);
             redrawCanvas(); // Redraw needed if deselecting
        }
        // Moved redrawCanvas calls into the specific conditions above
    }
});

// --- NEW: Functions for Inline Text Input ---

function startTextInput(x, y) {
    // Remove any existing input first (shouldn't happen often, but safety)
    if (activeTextInput) {
        finishTextInput(activeTextInput, false); // Cancel previous one
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.style.position = 'absolute';
    // Position relative to the canvas's top-left corner
    const canvasRect = canvas.getBoundingClientRect();
    input.style.left = `${canvasRect.left + window.scrollX + x}px`;
    input.style.top = `${canvasRect.top + window.scrollY + y}px`;
    // Restore basic styling:
    input.style.border = '1px solid #ccc';
    input.style.padding = '2px';
    input.style.font = `${16}px Arial`;
    input.style.backgroundColor = 'white';
    input.style.zIndex = '100'; // Ensure it's above the canvas

    // Add listeners
    input.addEventListener('blur', handleInputBlur); // Restore blur listener
    input.addEventListener('keydown', handleInputKeyDown);
    // Add a click listener to re-focus if clicked while active
    input.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent click from bubbling further
        input.focus();
    });


    document.body.appendChild(input);
    activeTextInput = input;
    // Delay focus slightly to ensure the element is ready
    setTimeout(() => input.focus(), 0);
    console.log('Text input element created, focusing shortly.');
}

function handleInputBlur(event) {
    console.log('Text input blurred.');
    finishTextInput(event.target, true); // Attempt to add shape on blur
}

function handleInputKeyDown(event) {
    console.log(`Key pressed in input: ${event.key}`); // Log all keys reaching the handler
    // Stop the event from bubbling up to global listeners (like the delete key listener)
    event.stopPropagation();

    // Let the input field handle most keys normally (typing)
    if (event.key === 'Enter') {
        console.log('Enter pressed in text input.');
        event.preventDefault(); // ONLY prevent default for Enter
        finishTextInput(event.target, true); // Add shape
    } else if (event.key === 'Escape') {
        console.log('Escape pressed in text input.');
        // No preventDefault needed for Escape
        finishTextInput(event.target, false); // Cancel (don't add shape)
    }
    // For all other keys, allow default typing behavior by not doing anything else
}

function finishTextInput(inputElement, addShape) {
    if (!inputElement || inputElement !== activeTextInput) return; // Safety check

    const text = inputElement.value.trim();

    if (addShape && text) {
        // Get position from the input element's style (relative to viewport)
        // and convert back to canvas coordinates
        const canvasRect = canvas.getBoundingClientRect();
        const inputRect = inputElement.getBoundingClientRect();
        const canvasX = inputRect.left - canvasRect.left;
        const canvasY = inputRect.top - canvasRect.top;

        // Create the Text shape
        const newTextShape = new Text(canvasX, canvasY, text, currentColor || '#000000'); // Use current color or black
        shapes.push(newTextShape);
        console.log('Added new text shape:', newTextShape);
        saveState();
        redrawCanvas();
    } else {
        console.log('Text input cancelled or empty.');
    }

    // Cleanup
    inputElement.removeEventListener('blur', handleInputBlur); // Match restoration above
    inputElement.removeEventListener('keydown', handleInputKeyDown);
    // Find the click listener to remove it (more robust than assuming it exists)
    // Note: getEventListeners is browser-specific, might not work reliably everywhere, but good for debugging
    const clickListener = Array.from(inputElement.getEventListeners?.('click') || []).find(l => l.listener.toString().includes('input.focus()'));
    if (clickListener) {
        inputElement.removeEventListener('click', clickListener.listener);
    }
    document.body.removeChild(inputElement);
    activeTextInput = null;
    console.log('Text input element removed.');

    // DO NOT reset tool here; it should remain 'text' until explicitly changed
    // setActiveTool('default'); // REMOVED THIS LINE
}

// --- END: Functions for Inline Text Input ---


// --- NEW: Double-click listener for editing text ---
canvas.addEventListener('dblclick', (e) => {
    // Prevent starting new text input on double-click
    if (activeTextInput) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Find the top-most text shape that was double-clicked
    let clickedTextShape = null;
    for (let i = shapes.length - 1; i >= 0; i--) {
        const shape = shapes[i];
        // Check if it's a Text object and the click is inside
        if (shape instanceof Text && shape.isInside(mouseX, mouseY)) {
            clickedTextShape = shape;
            break;
        }
    }

    if (clickedTextShape) {
        console.log('Editing text:', clickedTextShape);
        const newText = prompt("Edit text:", clickedTextShape.text);
        if (newText !== null && newText !== clickedTextShape.text) { // Only update if text changed and not cancelled
            clickedTextShape.text = newText;
            clickedTextShape.updateDimensions(); // Recalculate width/height
            redrawCanvas();
            saveState(); // Save the change
            console.log('Text updated to:', newText);
        } else if (newText === null) {
            console.log('Text edit cancelled.');
        } else {
            console.log('Text not changed.');
        }
    }
});
// ----------------------------------------------------

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    let cursor = currentCursor; // Start with current cursor

    // --- Initiate Dragging ---
    // If a shape is selected, we're not currently dragging/resizing/rotating,
    // and the mouse has moved beyond the threshold since mousedown: start dragging.
    if (selectedShape && !isDragging && !isResizing && !isRotating && initialMouseDownPos) {
        const dx = mouseX - initialMouseDownPos.x;
        const dy = mouseY - initialMouseDownPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > dragThreshold) {
            isDragging = true; // Start dragging now
            console.log('Drag threshold exceeded, starting drag.');
            // Calculate drag offset based on CURRENT mouse and shape position
            dragOffsetX = mouseX - selectedShape.x;
            dragOffsetY = mouseY - selectedShape.y;
            if (selectedShape instanceof Circle) { // Circle offset is relative to center
                dragOffsetX = mouseX - selectedShape.x;
                dragOffsetY = mouseY - selectedShape.y;
            }
            if (selectedShape instanceof Line) { // Line offset is relative to start point
                dragOffsetX = mouseX - selectedShape.x1;
                dragOffsetY = mouseY - selectedShape.y1;
                // Ensure dx/dy are stored for line dragging
                selectedShape.dx = selectedShape.x2 - selectedShape.x1;
                selectedShape.dy = selectedShape.y2 - selectedShape.y1;
            }
            // Set appropriate cursor now that dragging has started
            cursor = getCursorForHandle(null); // 'grabbing'
        }
    }

    // --- Handle Rotation ---
    if (isRotating && selectedShape && shapeCenter) {
        const dx = mouseX - shapeCenter.x;
        const dy = mouseY - shapeCenter.y;
        const currentAngle = Math.atan2(dy, dx);

        // Calculate the change in angle since the last mousemove (or mousedown)
        let angleDelta = currentAngle - rotationStartAngle;

        // Apply the delta to the shape's angle
        selectedShape.angle += angleDelta;

        // Update the start angle for the next mousemove event
        rotationStartAngle = currentAngle;

        cursor = getCursorForHandle('rotation'); // Should be 'grabbing'
        redrawCanvas();

    // --- Handle Resizing ---
    } else if (isResizing && selectedShape && activeHandle && selectedShape.initialCenter) {
        const shape = selectedShape;
        const minSize = handleSize * 2; // Minimum width/height or radius

        // Retrieve initial state stored on mousedown
        const initialX = shape.initialX;
        const initialY = shape.initialY;
        const initialW = shape.initialWidth;
        const initialH = shape.initialHeight;
        const initialAngle = shape.initialAngle;
        const initialCenter = shape.initialCenter;
        const initialRadius = shape.initialRadius; // For circles

        // Transform current mouse coordinates into the shape's initial unrotated frame
        const cosInitial = Math.cos(-initialAngle); // Use negative angle for reverse rotation
        const sinInitial = Math.sin(-initialAngle);
        const localX = mouseX - initialCenter.x;
        const localY = mouseY - initialCenter.y;
        const transformedMouseX = localX * cosInitial - localY * sinInitial + initialCenter.x;
        const transformedMouseY = localX * sinInitial + localY * cosInitial + initialCenter.y;

        // Calculate new dimensions/position based on handle type using TRANSFORMED mouse coords
        // and INITIAL dimensions/position
        let newX = initialX;
        let newY = initialY;
        let newW = initialW;
        let newH = initialH;

        switch (activeHandle) {
            case 'top-left':
                newW = Math.max(minSize, initialX + initialW - transformedMouseX);
                newH = Math.max(minSize, initialY + initialH - transformedMouseY);
                newX = initialX + initialW - newW;
                newY = initialY + initialH - newH;
                break;
            case 'top-center':
                 newH = Math.max(minSize, initialY + initialH - transformedMouseY);
                 newY = initialY + initialH - newH;
                 // newX = initialX; // X and W don't change
                 // newW = initialW;
                 break;
            case 'top-right':
                newW = Math.max(minSize, transformedMouseX - initialX);
                newH = Math.max(minSize, initialY + initialH - transformedMouseY);
                // newX = initialX; // X doesn't change
                newY = initialY + initialH - newH;
                 break;
            case 'middle-left':
                newW = Math.max(minSize, initialX + initialW - transformedMouseX);
                newX = initialX + initialW - newW;
                // newY = initialY; // Y and H don't change
                // newH = initialH;
                 break;
            case 'middle-right':
                newW = Math.max(minSize, transformedMouseX - initialX);
                 // newX = initialX; // X doesn't change
                 // newY = initialY; // Y and H don't change
                 // newH = initialH;
                break;
            case 'bottom-left':
                newW = Math.max(minSize, initialX + initialW - transformedMouseX);
                newH = Math.max(minSize, transformedMouseY - initialY);
                newX = initialX + initialW - newW;
                 // newY = initialY; // Y doesn't change
                 break;
            case 'bottom-center':
                 newH = Math.max(minSize, transformedMouseY - initialY);
                 // newX = initialX; // X and W don't change
                 // newW = initialW;
                 // newY = initialY; // Y doesn't change
                break;
            case 'bottom-right':
                 newW = Math.max(minSize, transformedMouseX - initialX);
                 newH = Math.max(minSize, transformedMouseY - initialY);
                 // newX = initialX; // X doesn't change
                 // newY = initialY; // Y doesn't change
                break;
        }

        // Apply the calculated new dimensions and position
        shape.width = newW;
        shape.height = newH;
        shape.x = newX;
        shape.y = newY;

        // --- NEW: Specific handling for Text ---
        if (shape instanceof Text) {
            // Scale font size based on the change in height
            const initialFontSize = shape.initialFontSize || 16; // Get initial font size
            const minFontSize = 4; // Minimum font size
            if (initialH > 0) { // Avoid division by zero
                 // Calculate new font size proportionally to height change
                 let calculatedFontSize = initialFontSize * (newH / initialH);
                 shape.fontSize = Math.max(minFontSize, calculatedFontSize); // Apply minimum size
            }
            // Recalculate width/height based on new font size and text content
            shape.updateDimensions();
            // Re-apply calculated position after updateDimensions
            shape.x = newX;
            shape.y = newY;
        }
        // ------------------------------------

        // Specific handling for Circle: maintain center, adjust radius based on transformed mouse
        if (shape instanceof Circle) {
            // Calculate distance from initial center to transformed mouse
            const dx = transformedMouseX - initialCenter.x;
            const dy = transformedMouseY - initialCenter.y;
            let newRadius = Math.sqrt(dx * dx + dy * dy);

            // Adjust radius based on which handle is dragged (approximate)
            // This part is tricky for circles. A simpler approach might be needed.
            // Let's try basing radius on average change from center for corners/sides.
            if (activeHandle.includes('left') || activeHandle.includes('right')) {
                newRadius = Math.abs(dx);
            } else if (activeHandle.includes('top') || activeHandle.includes('bottom')) {
                newRadius = Math.abs(dy);
            } else { // Corner handles
                 newRadius = (Math.abs(dx) + Math.abs(dy)) / 2; // Average distance change
            }

            shape.radius = Math.max(minSize / 2, newRadius);

            // Circle x/y is center, it should remain at initialCenter during resize
            shape.x = initialCenter.x;
            shape.y = initialCenter.y;
        }

        cursor = getCursorForHandle(activeHandle); // Cursor logic might still need adjustment for rotation
        redrawCanvas();

    // --- Handle Shape Dragging ---
    } else if (isDragging && selectedShape) {
        const newX = mouseX - dragOffsetX;
        const newY = mouseY - dragOffsetY;

        if (selectedShape instanceof Line) {
            // Line dragging logic (unaffected by rotation implementation)
            selectedShape.x1 = newX;
            selectedShape.y1 = newY;
            selectedShape.x2 = newX + selectedShape.dx;
            selectedShape.y2 = newY + selectedShape.dy;
            selectedShape.x = newX; // Update base x/y too
            selectedShape.y = newY;
        } else if (selectedShape instanceof Circle) {
            // Circle's x,y is its center
            selectedShape.x = newX;
            selectedShape.y = newY;
        } else {
            // Rectangle, Diamond, Text - x,y is top-left
            selectedShape.x = newX;
            selectedShape.y = newY;
        }
        cursor = getCursorForHandle(null); // Should be 'grabbing'
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
             } else {
                 // Hovering over empty space
                 if (currentShapeType === 'rectangle' || currentShapeType === 'circle' || currentShapeType === 'diamond' || currentShapeType === 'line') {
                     cursor = 'crosshair'; // Show crosshair if a drawing tool is active
                 } else if (currentShapeType === 'text') {
                     cursor = 'text'; // Show text cursor for text tool
                 } else {
                     cursor = 'default'; // Otherwise, default arrow
                 }
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
    let stateChanged = false; // Flag to check if we need to save state

    // Finalize rotation
    if (isRotating) {
        console.log('Finished rotating shape:', selectedShape);
        isRotating = false;
        activeHandle = null;
        shapeCenter = null;
        stateChanged = true; // Rotation changes state
        // Set cursor back to default or move
        canvas.style.cursor = selectedShape ? getCursorForHandle(null) : 'default';
        currentCursor = canvas.style.cursor;
        // No redraw needed here, mousemove already did it. Save state below.
    }

    // Finalize resizing
    if (isResizing) {
        console.log('Finished resizing shape:', selectedShape);
        // TODO: Resizing rotated shapes needs fixing. -> FIXED (mostly)
        isResizing = false;
        activeHandle = null;
        // --- Clean up initial state properties ---
        if (selectedShape) {
            delete selectedShape.initialX;
            delete selectedShape.initialY;
            delete selectedShape.initialWidth;
            delete selectedShape.initialHeight;
            delete selectedShape.initialRadius;
            delete selectedShape.initialAngle;
            delete selectedShape.initialCenter;
            delete selectedShape.initialMouseX;
            delete selectedShape.initialMouseY;
        }
        // ---------------------------------------
        stateChanged = true; // Resizing changes state
        // Set cursor back to default or move
        canvas.style.cursor = selectedShape ? getCursorForHandle(null) : 'default'; // Use getCursorForHandle for consistency
        currentCursor = canvas.style.cursor;
        // redrawCanvas(); // Redraw needed to potentially update cursor based on hover after resize - Handled below
    }

    // Finalize dragging
    if (isDragging) {
        console.log('Finished dragging shape:', selectedShape);
        isDragging = false;
        stateChanged = true; // Dragging changes state
        // Set cursor back to default or move
        canvas.style.cursor = selectedShape ? getCursorForHandle(null) : 'default';
        currentCursor = canvas.style.cursor;
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
            stateChanged = true; // Adding a line changes state
             // selectedShape = newLine; // Optionally select
        } else {
             console.log('Line drawing cancelled (start=end).');
         }
        isDrawingLine = false;
        // redrawCanvas(); // Handled below
        if (stateChanged) { // Only reset tool if a line was actually added
            setActiveTool('default'); // Reset tool after finishing line draw
        }
    }

    // Save state if any action modified shapes
    if (stateChanged) {
        saveState();
    }

    // Cursor should be handled by mousemove or setActiveTool now.
    // No longer need to force reset here.
     // canvas.style.cursor = 'default';
     // currentCursor = 'default';

     // Ensure redraw happens after flags are reset if a shape is still selected
     if (selectedShape) {
         redrawCanvas();
     }
     initialMouseDownPos = null; // Clear initial mouse down position
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
    if (isRotating) {
        isRotating = false;
        activeHandle = null;
        shapeCenter = null;
        console.log('Rotation cancelled (mouse left canvas)');
        redrawCanvas(); // Redraw without handles
    }
    // Reset cursor only if not actively doing something else (should be covered above)
    if (!isDragging && !isResizing && !isRotating && !isDrawingLine) {
        canvas.style.cursor = 'default';
        currentCursor = 'default';
    }
    initialMouseDownPos = null; // Clear initial mouse down position if mouse leaves
});

// Delete selected shape / Handle global keys
document.addEventListener('keydown', (e) => {
    // If the text input is active, let it handle the keydown event exclusively
    if (activeTextInput) {
        return;
    }

    // --- Shape Deletion ---
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
         // NEW: Cancel rotation on delete
         if (isRotating) {
             isRotating = false;
             activeHandle = null;
             shapeCenter = null;
             console.log("Rotation cancelled by delete key.");
         }
        redrawCanvas();
        saveState(); // Save state after deleting
    }
});


// --- Listen for Menu Actions via Preload ---
if (window.electronAPI) {
  window.electronAPI.onUndo(() => {
    console.log('Undo action triggered from menu.');
    undo();
  });
  window.electronAPI.onRedo(() => {
    console.log('Redo action triggered from menu.');
    redo();
  });

  // --- NEW: Listen for Save Request from Menu ---
  window.electronAPI.onRequestSave(async () => {
    console.log('Save As... action triggered from menu.');

    // Deselect shape temporarily for a clean image
    const previouslySelected = selectedShape;
    selectedShape = null;
    redrawCanvas(); // Redraw without selection highlight/handles

    try {
      // Show save dialog, allowing PNG and JPG
      const result = await window.electronAPI.saveDialog({
        name: 'Images', extensions: ['png', 'jpg']
      });

      if (!result.canceled && result.filePath) {
        const filePath = result.filePath;
        let dataURL;
        let format = 'png'; // Default to png

        // Determine format from file extension
        if (filePath.toLowerCase().endsWith('.jpg') || filePath.toLowerCase().endsWith('.jpeg')) {
          format = 'jpeg'; // Canvas uses 'jpeg'
        }

        // Generate Data URL
        if (format === 'jpeg') {
          // For JPG, need to draw background color first
          const currentBg = canvas.style.backgroundColor || '#ffffff'; // Use white if none set
          ctx.globalCompositeOperation = 'destination-over'; // Draw behind existing content
          ctx.fillStyle = currentBg;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.globalCompositeOperation = 'source-over'; // Reset composite operation
          dataURL = canvas.toDataURL('image/jpeg', 0.9); // Quality 0.9
          redrawCanvas(); // Redraw to remove the temporary background fill for subsequent operations
        } else { // PNG
          dataURL = canvas.toDataURL('image/png');
        }

        // Write file via main process
        const writeResult = await window.electronAPI.writeFile(filePath, dataURL);
        if (writeResult.success) {
          console.log(`Canvas saved successfully to ${filePath}`);
          // Optionally show a success message to the user
        } else {
          console.error('Failed to save canvas:', writeResult.error);
          // Optionally show an error message to the user
          alert(`Error saving file: ${writeResult.error}`); // Simple alert for error
        }
      } else {
        console.log('Save dialog cancelled.');
      }
    } catch (error) {
      console.error('Error during save process:', error);
      alert(`An error occurred: ${error.message}`); // Simple alert for error
    } finally {
      // Reselect shape if it was selected before saving
      selectedShape = previouslySelected;
      if (selectedShape) { // Only redraw if there was a selection
          redrawCanvas();
      }
    }
  });
  // ---------------------------------------------

} else {
  console.error('electronAPI not found on window. Check preload script.');
}


// --- Initial Draw & State ---
canvas.style.backgroundColor = '#f0f0f0';
colorPicker.value = '#000000'; // Set HTML picker default to black, even if internal currentColor is null
saveState(); // Save the initial empty state
redrawCanvas();
// updateUndoRedoButtons(); // Removed call
console.log('Renderer process loaded.');

// --- NEW: Function to load system fonts ---
async function loadSystemFonts() {
    console.log('Requesting system fonts...');
    try {
        const result = await window.electronAPI.getSystemFonts();
        if (result.success && result.fonts) {
            console.log(`Received ${result.fonts.length} fonts.`);
            fontSelector.innerHTML = ''; // Clear placeholder/previous options
            // Add a default option maybe? Or just the list.
            result.fonts.forEach(font => {
                // Basic filtering for common system/web fonts if desired
                // if (!font.startsWith('.') && !font.startsWith('@')) {
                    const option = document.createElement('option');
                    option.value = font;
                    option.textContent = font;
                    // Set initial selection if it matches a common default like Arial
                    if (font.toLowerCase() === 'arial') {
                        option.selected = true;
                    }
                    fontSelector.appendChild(option);
                // }
            });
            console.log('Font selector populated.');
        } else {
            console.error('Failed to load fonts:', result.error);
            fontSelector.innerHTML = '<option value="Arial">Arial (Default)</option>'; // Fallback
        }
    } catch (error) {
        console.error('Error calling getSystemFonts:', error);
        fontSelector.innerHTML = '<option value="Arial">Arial (Default)</option>'; // Fallback
    }
}
// -----------------------------------------

setActiveTool('default'); // Start with the default selection tool active
loadSystemFonts(); // Load fonts when the renderer starts
