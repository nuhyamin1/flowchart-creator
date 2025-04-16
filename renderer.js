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

// --- NEW: Zoom and Pan State ---
let zoomLevel = 1.0;
let offsetX = 0;
let offsetY = 0;
const minZoom = 0.1;
const maxZoom = 10.0;
// -----------------------------

let activeHandle = null; // Stores the type ('top-left', 'rotation', etc.) of the handle being dragged
const handleSize = 8; // Size of the square resize handles
let currentCursor = 'default'; // To manage cursor style changes
let activeTextInput = null; // Reference to the currently active text input element
let editingTextShape = null; // Store the shape being edited
let initialMouseDownPos = null; // Store mouse position on mousedown (in canvas coordinates)
const dragThreshold = 3; // Pixels mouse must move to initiate drag
let clipboardShape = null; // Variable to hold the copied shape data


// --- NEW: Helper Function to get Mouse Position in Canvas Coordinates ---
function getMousePos(event) {
    const rect = canvas.getBoundingClientRect();
    // Screen coordinates relative to canvas top-left
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    // Transform screen coordinates to canvas coordinates
    const canvasX = (screenX - offsetX) / zoomLevel;
    const canvasY = (screenY - offsetY) / zoomLevel;
    return { x: canvasX, y: canvasY };
}
// --------------------------------------------------------------------


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
    } else if (toolType === 'image') { // NEW: Image tool
        canvas.style.cursor = 'progress'; // Indicate loading briefly
        currentCursor = 'progress';
        // Trigger file selection immediately
        triggerImageSelection(); // We'll define this function next
        // Note: We don't immediately deselect shape here.
        // The tool will be reset to 'default' after image selection completes.
        return; // Prevent further deselection logic for image tool itself
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
        this.flipH = false; // NEW: Horizontal flip state
        this.flipV = false; // NEW: Vertical flip state
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
        // Ensure angle is copied
        cloned.angle = this.angle;
        // NEW: Ensure flip states are copied
        cloned.flipH = this.flipH;
        cloned.flipV = this.flipV;
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
        // Apply flip BEFORE rotation for standard mirror effect
        // Swap flip axes for Diamond so vertical and horizontal flips behave correctly
ctx.scale(this.flipV ? -1 : 1, this.flipH ? -1 : 1);
        ctx.rotate(this.angle); // Rotate the flipped context

        // Draw the rectangle centered at the NEW origin (0,0)
        const halfW = this.width / 2;
        const halfH = this.height / 2;

        if (this.color) {
            ctx.fillStyle = this.color;
            ctx.fillRect(-halfW, -halfH, this.width, this.height); // Draw centered
        }
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(-halfW, -halfH, this.width, this.height); // Draw centered

        ctx.restore(); // Restore context state (removes translate, rotate, scale)
    }

    isInside(mouseX, mouseY) {
        const center = this.getCenter();
        const angle = this.angle;
        const cos = Math.cos(-angle); // Use negative angle for inverse rotation
        const sin = Math.sin(-angle);

        // 1. Translate mouse coordinates so the shape's center is the origin
        let translatedX = mouseX - center.x;
        let translatedY = mouseY - center.y;

        // 2. Apply inverse flip (scale)
        // Note: Scaling by -1 is its own inverse
        const scaleX = this.flipH ? -1 : 1;
        const scaleY = this.flipV ? -1 : 1;
        translatedX /= scaleX;
        translatedY /= scaleY;


        // 3. Apply inverse rotation
        const rotatedX = translatedX * cos - translatedY * sin;
        const rotatedY = translatedX * sin + translatedY * cos;

        // 4. Check if the transformed point is within the un-transformed bounding box
        //    The bounding box is centered at (0,0) in this translated/rotated space
        const halfW = this.width / 2;
        const halfH = this.height / 2;

        return rotatedX >= -halfW && rotatedX <= halfW &&
               rotatedY >= -halfH && rotatedY <= halfH;
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

        // Apply flip, then rotate each handle position around the center
        const scaleX = this.flipH ? -1 : 1;
        const scaleY = this.flipV ? -1 : 1;

        return unrotatedHandles.map(handle => {
            // 1. Apply flip to relative coordinates
            const flippedX = handle.relX * scaleX;
            const flippedY = handle.relY * scaleY;

            // 2. Apply rotation to flipped coordinates
            const rotatedX = flippedX * cos - flippedY * sin;
            const rotatedY = flippedX * sin + flippedY * cos;

            // 3. Translate to absolute position and adjust for handle size
            return {
                x: center.x + rotatedX - handleOffset,
                y: center.y + rotatedY - handleOffset,
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
        // Apply flip BEFORE rotation
        // Swap flip axes for Diamond so vertical and horizontal flips behave correctly
ctx.scale(this.flipV ? -1 : 1, this.flipH ? -1 : 1);
        ctx.rotate(this.angle); // Rotate the flipped context

        // Draw the circle centered at the NEW origin (0,0)
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2); // Draw centered at (0,0)
        if (this.color) {
            ctx.fillStyle = this.color;
            ctx.fill();
        }
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore(); // Restore context state (removes translate, rotate, scale)
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

        // Apply flip, then rotate each handle position around the center
        const scaleX = this.flipH ? -1 : 1;
        const scaleY = this.flipV ? -1 : 1;

        return unrotatedHandles.map(handle => {
            // 1. Apply flip to relative coordinates
            const flippedX = handle.relX * scaleX;
            const flippedY = handle.relY * scaleY;

            // 2. Apply rotation to flipped coordinates
            const rotatedX = flippedX * cos - flippedY * sin;
            const rotatedY = flippedX * sin + flippedY * cos;

            // 3. Translate to absolute position and adjust for handle size
            return {
                x: center.x + rotatedX - handleOffset,
                y: center.y + rotatedY - handleOffset,
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
        // Apply flip BEFORE rotation
        // Swap flip axes for Diamond so vertical and horizontal flips behave correctly
ctx.scale(this.flipV ? -1 : 1, this.flipH ? -1 : 1);
        ctx.rotate(this.angle); // Rotate the flipped context

        // Draw the diamond centered at the NEW origin (0,0)
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        ctx.beginPath();
        ctx.moveTo(0, -halfH);      // Top point (relative to center)
        ctx.lineTo(halfW, 0);       // Right point
        ctx.lineTo(0, halfH);       // Bottom point
        ctx.lineTo(-halfW, 0);      // Left point
        ctx.closePath();

        if (this.color) {
            ctx.fillStyle = this.color;
            ctx.fill();
        }
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore(); // Restore context state (removes translate, rotate, scale)
    }

    isInside(mouseX, mouseY) {
        const center = this.getCenter();
        const angle = this.angle;
        const cos = Math.cos(-angle); // Use negative angle for inverse rotation
        const sin = Math.sin(-angle);

        // 1. Translate mouse coordinates so the shape's center is the origin
        let translatedX = mouseX - center.x;
        let translatedY = mouseY - center.y;

        // 2. Apply inverse flip (scale)
        const scaleX = this.flipH ? -1 : 1;
        const scaleY = this.flipV ? -1 : 1;
        translatedX /= scaleX;
        translatedY /= scaleY;

        // 3. Apply inverse rotation
        const rotatedX = translatedX * cos - translatedY * sin;
        const rotatedY = translatedX * sin + translatedY * cos;

        // 4. Check if the transformed point is within the un-transformed diamond shape
        //    The diamond points relative to the center (0,0) are:
        //    (0, -h/2), (w/2, 0), (0, h/2), (-w/2, 0)
        //    We can check if the point is within the polygon defined by these vertices.
        //    A simpler check for diamonds (and rectangles) is to check against the bounding box
        //    in the transformed space, which we already did for Rectangle.
        const halfW = this.width / 2;
        const halfH = this.height / 2;

        // Check if the point is within the bounding box in the rotated/scaled space
        if (rotatedX < -halfW || rotatedX > halfW || rotatedY < -halfH || rotatedY > halfH) {
            return false; // Outside the bounding box, definitely not inside the diamond
        }

        // More precise check: Check if the point is within the diamond shape using line equations
        // The diamond edges pass through: (0, -h/2), (w/2, 0), (0, h/2), (-w/2, 0)
        // Equation for line segment: y - y1 = m(x - x1)
        // Or check using sum of distances or winding number, but simpler for diamond:
        // Check if |x / (w/2)| + |y / (h/2)| <= 1
        // This equation defines the boundary of a diamond centered at the origin.
        return (Math.abs(rotatedX) / halfW) + (Math.abs(rotatedY) / halfH) <= 1;
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

        // Apply flip, then rotate each handle position around the center
        const scaleX = this.flipH ? -1 : 1;
        const scaleY = this.flipV ? -1 : 1;

        return unrotatedHandles.map(handle => {
            // 1. Apply flip to relative coordinates
            const flippedX = handle.relX * scaleX;
            const flippedY = handle.relY * scaleY;

            // 2. Apply rotation to flipped coordinates
            const rotatedX = flippedX * cos - flippedY * sin;
            const rotatedY = flippedX * sin + flippedY * cos;

            // 3. Translate to absolute position and adjust for handle size
            return {
                x: center.x + rotatedX - handleOffset,
                y: center.y + rotatedY - handleOffset,
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
        // Calculate the center of the line
        const centerX = (this.x1 + this.x2) / 2;
        const centerY = (this.y1 + this.y2) / 2;
        ctx.save();
        ctx.translate(centerX, centerY);
        // Apply flip
        ctx.scale(this.flipH ? -1 : 1, this.flipV ? -1 : 1);
        // Draw the line centered at (0,0)
        ctx.beginPath();
        ctx.moveTo(this.x1 - centerX, this.y1 - centerY);
        ctx.lineTo(this.x2 - centerX, this.y2 - centerY);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.restore();
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
        // Calculate height based on line count and font size (approximate line height)
        const lines = this.text.split('\n');
        const lineHeight = this.fontSize * 1.2; // Approximate line height
        this.height = lines.length * lineHeight;
        // Find the width of the longest line
        this.width = 0;
        lines.forEach(line => {
            const metrics = ctx.measureText(line);
            if (metrics.width > this.width) {
                this.width = metrics.width;
            }
        });
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

        // --- Draw Multiline Text ---
        const lines = this.text.split('\n');
        const lineHeight = this.fontSize * 1.2; // Use the same approximate line height as in updateDimensions
        let currentY = this.y;

        lines.forEach(line => {
            // Adjust drawX per line for alignment
            // Determine the correct X coordinate based on textAlign
            // ctx.textAlign handles the actual alignment relative to this point
            let lineDrawX;
            if (this.textAlign === 'center') {
                lineDrawX = this.x + this.width / 2; // Anchor point is the center
            } else if (this.textAlign === 'right') {
                lineDrawX = this.x + this.width;   // Anchor point is the right edge
            } else { // Default to left
                lineDrawX = this.x;               // Anchor point is the left edge
            }
            ctx.fillText(line, lineDrawX, currentY);
            currentY += lineHeight;
        });
        // --- End Draw Multiline Text ---


        // --- Manual Underline (Adjusted for Multiline) ---
        if (this.textDecoration === 'underline') {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = Math.max(1, Math.floor(this.fontSize / 16));
            currentY = this.y; // Reset Y for underline drawing

            lines.forEach(line => {
                const metrics = ctx.measureText(line);
                const textWidth = metrics.width;
                let lineStartX = this.x; // Default left
                let lineEndX = this.x + textWidth; // Underline only the text itself

                if (this.textAlign === 'center') {
                    lineStartX = this.x + (this.width - textWidth) / 2;
                    lineEndX = lineStartX + textWidth;
                } else if (this.textAlign === 'right') {
                    lineStartX = this.x + this.width - textWidth;
                    lineEndX = lineStartX + textWidth;
                }

                const underlineY = currentY + lineHeight - (lineHeight - this.fontSize); // Position slightly below baseline

                ctx.beginPath();
                ctx.moveTo(lineStartX, underlineY);
                ctx.lineTo(lineEndX, underlineY);
                ctx.stroke();

                currentY += lineHeight; // Move to next line's position
            });
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
} // <-- CORRECTED BRACE

// --- NEW: Image Shape Class ---
class ImageShape extends Shape {
    constructor(x, y, width, height, dataUrl) {
        super(x, y, null); // Images don't use the 'color' property for fill
        this.width = Math.max(width, handleSize * 2);
        this.height = Math.max(height, handleSize * 2);
        this.dataUrl = dataUrl;
        this.type = 'image';
        this.imageElement = new Image();
        this.isLoaded = false;
        this.isLoading = true;
        this.loadError = false;

        // Start loading the image
        this.imageElement.onload = () => {
            console.log(`Image loaded successfully: ${this.dataUrl.substring(0, 50)}...`);
            this.isLoaded = true;
            this.isLoading = false;
            // Adjust initial width/height based on image aspect ratio if desired
            // For now, we use the provided width/height
            redrawCanvas(); // Redraw canvas once image is loaded
        };
        this.imageElement.onerror = (err) => {
            console.error('Error loading image:', err, this.dataUrl.substring(0, 50));
            this.isLoading = false;
            this.loadError = true;
            redrawCanvas(); // Redraw to potentially show an error state
        };
        this.imageElement.src = this.dataUrl;
    }

    getCenter() {
        return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
    }

    draw(ctx) {
        if (this.isLoading) {
            // Optional: Draw a placeholder while loading
            ctx.save();
            ctx.strokeStyle = '#cccccc';
            ctx.lineWidth = 1;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.fillStyle = '#aaaaaa';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '12px Arial';
            ctx.fillText('Loading...', this.x + this.width / 2, this.y + this.height / 2);
            ctx.restore();
            return;
        }
        if (this.loadError) {
            // Optional: Draw an error indicator
            ctx.save();
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
            ctx.fillStyle = '#ffeeee';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.fillStyle = 'red';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('Error!', this.x + this.width / 2, this.y + this.height / 2);
            ctx.restore();
            return;
        }
        if (!this.isLoaded) return; // Should not happen if not loading/error, but safety check

        const center = this.getCenter();
        ctx.save();
        ctx.translate(center.x, center.y);
        // Apply flip BEFORE rotation
        ctx.scale(this.flipH ? -1 : 1, this.flipV ? -1 : 1);
        ctx.rotate(this.angle);

        // Draw the image centered at the NEW origin (0,0)
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        try {
            ctx.drawImage(this.imageElement, -halfW, -halfH, this.width, this.height);
        } catch (e) {
            // Catch potential errors if image becomes invalid after load? Unlikely but safe.
            console.error("Error drawing image:", e);
            // Optionally draw error state here too
        }

        ctx.restore(); // Restore context state
    }

    // Use simple bounding box check, same as Rectangle
    isInside(mouseX, mouseY) {
        const center = this.getCenter();
        const angle = this.angle;
        const cos = Math.cos(-angle); // Inverse rotation
        const sin = Math.sin(-angle);

        let translatedX = mouseX - center.x;
        let translatedY = mouseY - center.y;

        // Inverse flip
        const scaleX = this.flipH ? -1 : 1;
        const scaleY = this.flipV ? -1 : 1;
        translatedX /= scaleX;
        translatedY /= scaleY;

        // Inverse rotate
        const rotatedX = translatedX * cos - translatedY * sin;
        const rotatedY = translatedX * sin + translatedY * cos;

        const halfW = this.width / 2;
        const halfH = this.height / 2;

        return rotatedX >= -halfW && rotatedX <= halfW &&
               rotatedY >= -halfH && rotatedY <= halfH;
    }

    // Use handles similar to Rectangle
    getHandles() {
        const center = this.getCenter();
        const angle = this.angle;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        const handleOffset = handleSize / 2;
        const rotationHandleOffset = 20;

        const unrotatedHandles = [
            { relX: -halfW, relY: -halfH, type: 'top-left' },
            { relX: 0,     relY: -halfH, type: 'top-center' },
            { relX: halfW, relY: -halfH, type: 'top-right' },
            { relX: -halfW, relY: 0,      type: 'middle-left' },
            { relX: halfW, relY: 0,      type: 'middle-right' },
            { relX: -halfW, relY: halfH, type: 'bottom-left' },
            { relX: 0,     relY: halfH, type: 'bottom-center' },
            { relX: halfW, relY: halfH, type: 'bottom-right' },
            { relX: 0,     relY: -halfH - rotationHandleOffset, type: 'rotation' }
        ];

        const scaleX = this.flipH ? -1 : 1;
        const scaleY = this.flipV ? -1 : 1;

        return unrotatedHandles.map(handle => {
            const flippedX = handle.relX * scaleX;
            const flippedY = handle.relY * scaleY;
            const rotatedX = flippedX * cos - flippedY * sin;
            const rotatedY = flippedX * sin + flippedY * cos;
            return {
                x: center.x + rotatedX - handleOffset,
                y: center.y + rotatedY - handleOffset,
                type: handle.type
            };
        });
    }

    clone() {
        // Create a new instance, passing the essential data
        const cloned = new ImageShape(this.x, this.y, this.width, this.height, this.dataUrl);
        // Copy state properties
        cloned.angle = this.angle;
        cloned.flipH = this.flipH;
        cloned.flipV = this.flipV;
        cloned.id = this.id; // Keep original ID for history tracking? Or generate new? Let's keep for now.
        // Note: The imageElement itself is not deeply cloned, but the constructor
        // will create a new Image element and start loading from the dataUrl.
        // The loaded state (isLoaded, isLoading, loadError) will be managed by the new instance.
        return cloned;
    }
}
// --- END: Image Shape Class ---


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

// --- NEW: Copy/Paste Handlers ---
function handleCopyCanvas() {
    if (selectedShape) {
        clipboardShape = selectedShape.clone(); // Use the clone method
        console.log('Shape copied to clipboard:', clipboardShape);
    } else {
        clipboardShape = null; // Clear clipboard if nothing is selected
        console.log('Nothing selected to copy.');
    }
}

function handlePasteCanvas() {
    if (clipboardShape) {
        const newShape = clipboardShape.clone(); // Clone again for pasting
        // Offset the pasted shape slightly
        const offsetAmount = 10; // Pixels to offset
        newShape.x += offsetAmount;
        newShape.y += offsetAmount;
        // If it's a line, offset both points
        if (newShape.type === 'line') {
            newShape.x1 += offsetAmount;
            newShape.y1 += offsetAmount;
            newShape.x2 += offsetAmount;
            newShape.y2 += offsetAmount;
        }
        newShape.id = Date.now() + Math.random(); // Give it a new unique ID
        shapes.push(newShape);
        selectedShape = newShape; // Select the newly pasted shape
        saveState(); // Save state for undo
        redrawCanvas();
        console.log('Shape pasted from clipboard:', newShape);
    } else {
        console.log('Clipboard is empty.');
    }
}
// --------------------------------

// Removed updateUndoRedoButtons function


// --- Canvas Redraw ---
function redrawCanvas() {
    // Save the default state (identity transform)
    ctx.save();

    // Clear the entire visible canvas area (untransformed)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply the current pan and zoom transformation
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoomLevel, zoomLevel);

    // --- Draw all shapes within the transformed context ---
    shapes.forEach(shape => {
        // Pass the transformed context to the draw method
        // Shape coordinates are already in canvas space
        shape.draw(ctx);
    });

    // --- Draw temporary line (also in transformed context) ---
    if (isDrawingLine) {
        ctx.beginPath();
        ctx.moveTo(lineStartX, lineStartY);
        ctx.lineTo(tempLineEndX, tempLineEndY);
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1; // Reset line width after drawing temp line
    }

    // --- Draw selection highlight and handles (within transformed context) ---
    if (selectedShape) {
        // Apply shape's rotation ON TOP of the global zoom/pan
        const center = selectedShape.getCenter();
        const angle = selectedShape.angle;

        // --- Draw Rotated Selection Highlight ---
        ctx.save(); // Save the zoomed/panned state
        ctx.translate(center.x, center.y); // Translate origin to shape center
        // Apply flip BEFORE rotation for highlight
        ctx.scale(selectedShape.flipH ? -1 : 1, selectedShape.flipV ? -1 : 1);
        ctx.rotate(angle); // Rotate the flipped context
        // DO NOT translate back here. Draw relative to the new (0,0) center.

        // Styles are affected by zoom, adjust line width if needed
        const scaledLineWidth = 2 / zoomLevel; // Make highlight consistent thickness visually
        const scaledHandleSize = handleSize / zoomLevel; // Make handles consistent size visually
        const scaledHandleOffset = scaledHandleSize / 2;
        const scaledRotationHandleOffset = 20 / zoomLevel; // Adjust rotation handle distance

        ctx.strokeStyle = 'blue';
        ctx.lineWidth = scaledLineWidth;
        ctx.setLineDash([5 / zoomLevel, 3 / zoomLevel]); // Scale dash pattern

        // Draw highlight based on shape type, centered at (0,0) in the transformed space
        if (selectedShape instanceof Rectangle) {
            const halfW = selectedShape.width / 2;
            const halfH = selectedShape.height / 2;
            ctx.strokeRect(-halfW, -halfH, selectedShape.width, selectedShape.height);
        } else if (selectedShape instanceof Circle) {
            ctx.beginPath();
            ctx.arc(0, 0, selectedShape.radius, 0, Math.PI * 2); // Centered at (0,0)
            ctx.stroke();
        } else if (selectedShape instanceof Diamond) {
            const halfW = selectedShape.width / 2;
            const halfH = selectedShape.height / 2;
            ctx.beginPath();
            ctx.moveTo(0, -halfH);      // Top point (relative to center)
            ctx.lineTo(halfW, 0);       // Right point
            ctx.lineTo(0, halfH);       // Bottom point
            ctx.lineTo(-halfW, 0);      // Left point
            ctx.closePath();
            ctx.stroke();
        } else if (selectedShape instanceof ImageShape) { // NEW: Highlight for ImageShape
            const halfW = selectedShape.width / 2;
            const halfH = selectedShape.height / 2;
            ctx.strokeRect(-halfW, -halfH, selectedShape.width, selectedShape.height);
        }
        // Lines and Text don't get highlight box drawn within this rotated/scaled context

        // Restore context from shape rotation/scale/translation-to-center
        ctx.restore(); // Back to just zoomed/panned state

        // Draw Text highlight (no rotation/flip applied to highlight itself)
        if (selectedShape instanceof Text) {
            // Apply zoom scaling to the highlight stroke
            ctx.strokeStyle = 'blue';
            ctx.lineWidth = scaledLineWidth;
            ctx.setLineDash([5 / zoomLevel, 3 / zoomLevel]);
            ctx.strokeRect(selectedShape.x, selectedShape.y, selectedShape.width, selectedShape.height);
        }

        ctx.setLineDash([]); // Reset line dash
        // --- End Selection Highlight ---


        // --- Draw Handles (adjust size and position based on zoom) ---
        // Get handles based on UNZOOMED size, then draw them scaled
        const handles = selectedShape.getHandles(); // These coords are in canvas space (already account for flip/rotation)
        if (handles.length > 0) {
             ctx.fillStyle = 'white';
             ctx.strokeStyle = 'black';
             ctx.lineWidth = 1 / zoomLevel; // Keep border visually thin

             handles.forEach(handle => {
                 // Calculate handle center for drawing scaled square/circle
                 const handleCenterX = handle.x + handleSize / 2; // Original center
                 const handleCenterY = handle.y + handleSize / 2; // Original center

                 if (handle.type === 'rotation') {
                     // Draw rotation handle as a circle (scaled size)
                     ctx.beginPath();
                     ctx.arc(handleCenterX, handleCenterY, scaledHandleSize / 1.5, 0, Math.PI * 2);
                     ctx.fillStyle = 'lightblue';
                     ctx.fill();
                     ctx.stroke();
                 } else {
                     // Draw resize handles as squares (scaled size)
                     ctx.fillStyle = 'white';
                     // Calculate top-left corner for scaled square
                     const scaledHandleX = handle.x + (handleSize - scaledHandleSize) / 2;
                     const scaledHandleY = handle.y + (handleSize - scaledHandleSize) / 2;
                     ctx.fillRect(scaledHandleX, scaledHandleY, scaledHandleSize, scaledHandleSize);
                     ctx.strokeRect(scaledHandleX, scaledHandleY, scaledHandleSize, scaledHandleSize);
                 }
             });
        }
        // -------------------------------
    } // End if(selectedShape)

    // Restore the default context state (removes zoom/pan)
    ctx.restore();
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
            const buttonElement = e.target.closest('.align-button'); // Get the button element
            const newAlign = buttonElement ? buttonElement.getAttribute('data-align') : null; // Get attribute from button
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
    const mousePos = getMousePos(e); // Use transformed coordinates
    const mouseX = mousePos.x;
    const mouseY = mousePos.y;

    isDragging = false; // Reset flags
    isResizing = false;
    isRotating = false; // Reset rotation flag
    activeHandle = null;
    shapeCenter = null;
    initialMouseDownPos = { x: mouseX, y: mouseY }; // Store initial position (canvas coords)

    // Priority 1: Check if clicking on a handle of the selected shape
    if (selectedShape) {
        // Check handles using canvas coordinates
        activeHandle = getHandleAt(mouseX, mouseY);
        if (activeHandle) {
            initialMouseDownPos = null; // Don't check drag threshold if starting on handle
            // Bring selected shape to front (if not already)
            const shapeIndex = shapes.indexOf(selectedShape);
            if (shapeIndex !== -1 && shapeIndex < shapes.length - 1) {
                shapes.splice(shapeIndex, 1);
                shapes.push(selectedShape);
            }

            if (activeHandle === 'rotation') {
                isRotating = true;
                isResizing = false;
                shapeCenter = selectedShape.getCenter();
                // Calculate initial angle from center to mouse (using canvas coords)
                const dx = mouseX - shapeCenter.x;
                const dy = mouseY - shapeCenter.y;
                rotationStartAngle = Math.atan2(dy, dx);
                console.log(`Start rotating. Center: (${shapeCenter.x.toFixed(1)}, ${shapeCenter.y.toFixed(1)}), Start Angle: ${rotationStartAngle.toFixed(2)}`);
                canvas.style.cursor = getCursorForHandle('rotation');
                currentCursor = canvas.style.cursor;

            } else { // Resize handle
                isResizing = true;
                isRotating = false;
                console.log(`Start resizing using handle: ${activeHandle}`);
                // Store initial state (using canvas coords)
                selectedShape.initialX = selectedShape.x;
                selectedShape.initialY = selectedShape.y;
                selectedShape.initialWidth = selectedShape.width;
                selectedShape.initialHeight = selectedShape.height;
                selectedShape.initialRadius = selectedShape.radius;
                selectedShape.initialAngle = selectedShape.angle;
                selectedShape.initialCenter = selectedShape.getCenter();
                selectedShape.initialMouseX = mouseX; // Store initial canvas mouse coords
                selectedShape.initialMouseY = mouseY;
                if (selectedShape instanceof Text) {
                    selectedShape.initialFontSize = selectedShape.fontSize;
                }
            }

            redrawCanvas();
            return; // Handled handle click
        }
    }

    // Priority 2: Start drawing a new line
    if (currentShapeType === 'line') {
        initialMouseDownPos = null;
        isDrawingLine = true;
        lineStartX = mouseX; // Use canvas coords
        lineStartY = mouseY;
        tempLineEndX = mouseX;
        tempLineEndY = mouseY;
        selectedShape = null;
        console.log(`Starting line at (${lineStartX.toFixed(1)}, ${lineStartY.toFixed(1)})`);
        redrawCanvas();
        return; // Handled line start
    }

    // Priority 3: Click on existing shape to select/drag
    let clickedShape = null;
    for (let i = shapes.length - 1; i >= 0; i--) {
        const shape = shapes[i];
        // Use canvas coords for isInside check
        if (shape.isInside(mouseX, mouseY)) {
            clickedShape = shape;
            break;
        }
    }

    if (clickedShape) {
        selectedShape = clickedShape;
        // initialMouseDownPos (canvas coords) is already set
        activeHandle = null;
        isResizing = false;
        isRotating = false;
        // Drag offset calculated in mousemove when drag starts

        // Bring selected shape to front
        const shapeIndex = shapes.indexOf(selectedShape);
        if (shapeIndex !== -1 && shapeIndex < shapes.length - 1) {
            shapes.splice(shapeIndex, 1);
            shapes.push(selectedShape);
        }

         // Update UI controls
         colorPicker.value = selectedShape.color || '#000000';
         if (selectedShape instanceof Text) {
             fontSelector.value = selectedShape.fontFamily;
             boldButton.classList.toggle('selected', selectedShape.fontWeight === 'bold');
             italicButton.classList.toggle('selected', selectedShape.fontStyle === 'italic');
             underlineButton.classList.toggle('selected', selectedShape.textDecoration === 'underline');
             document.querySelectorAll('.align-button.selected').forEach(btn => btn.classList.remove('selected'));
             document.querySelector(`.align-button[data-align="${selectedShape.textAlign}"]`)?.classList.add('selected');
         }

          console.log('Selected existing shape:', selectedShape);
          redrawCanvas(); // Show selection immediately

      } else {
        // Priority 4: Click on background
        initialMouseDownPos = null;
        selectedShape = null; // Deselect first
        let newShape;
        const defaultWidth = 100;
        const defaultHeight = 60;
        const defaultRadius = 40;
        // Use canvas coords for positioning new shapes
        const shapeX = mouseX - defaultWidth / 2;
        const shapeY = mouseY - defaultHeight / 2;
        const circleCenterX = mouseX;
        const circleCenterY = mouseY;

        // Add new shape if a drawing tool is active
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
                 saveState();
                 setActiveTool('default'); // Reset tool
                 redrawCanvas(); // Redraw needed after adding shape and resetting tool
             }
        } else if (currentShapeType === 'text' && !activeTextInput) {
            // Start inline text input using canvas coords
            console.log(`Starting text input at canvas coords (${mouseX.toFixed(1)}, ${mouseY.toFixed(1)})`);
            redrawCanvas(); // Clear selection
            startTextInput(mouseX, mouseY); // Pass canvas coords
            e.stopPropagation();
            // State saved/redrawn when input finishes
        } else if (currentShapeType === 'image') {
            // Do nothing on mousedown if image tool is selected - handled by setActiveTool/triggerImageSelection
            console.log('Image tool selected, waiting for file dialog.');
        } else {
             // Clicked background with default/line tool, or text tool already active
             console.log(`Clicked background with ${currentShapeType} tool, deselected shape.`);
             redrawCanvas(); // Redraw needed to show deselection
        }
    }
}); // End mousedown listener


// --- NEW: Function to handle Image Tool Selection ---
async function triggerImageSelection() {
    console.log('Image tool selected, opening dialog...');
    try {
        const result = await window.electronAPI.openImageDialog();
        if (result.success && result.dataUrl) {
            console.log('Image data received from main process.');
            // Create an in-memory image to get dimensions
            const tempImg = new Image();
            tempImg.onload = () => {
                // Place the image near the center of the current view
                const viewCenterX = (canvas.width / 2 - offsetX) / zoomLevel;
                const viewCenterY = (canvas.height / 2 - offsetY) / zoomLevel;
                const imgWidth = tempImg.naturalWidth || 100; // Default size if naturalWidth fails
                const imgHeight = tempImg.naturalHeight || 100;
                const imgX = viewCenterX - imgWidth / 2;
                const imgY = viewCenterY - imgHeight / 2;

                const newImageShape = new ImageShape(imgX, imgY, imgWidth, imgHeight, result.dataUrl);
                shapes.push(newImageShape);
                selectedShape = newImageShape; // Select the new image
                console.log('Added new image shape:', newImageShape);
                saveState();
                redrawCanvas(); // Redraw to show the new image (or its loading state)
                setActiveTool('default'); // Switch back to default tool after adding
            };
            tempImg.onerror = () => {
                console.error('Failed to load temporary image for dimensions.');
                alert('Failed to load image dimensions.');
                setActiveTool('default'); // Switch back to default tool on error
            };
            tempImg.src = result.dataUrl;

        } else {
            console.log('Image selection failed or cancelled:', result.error);
            // If selection was cancelled or failed, just switch back to default tool
            setActiveTool('default');
        }
    } catch (error) {
        console.error('Error during image selection process:', error);
        alert(`Error selecting image: ${error.message}`);
        setActiveTool('default'); // Switch back to default tool on error
    }
}
// --- END: Image Tool Selection ---


// --- NEW: Functions for Inline Text Input ---

// Takes CANVAS coordinates (x, y)
function startTextInput(canvasX, canvasY) {
    if (activeTextInput) {
        finishTextInput(activeTextInput, false);
    }

    const textarea = document.createElement('textarea');
    textarea.style.position = 'absolute';

    // --- Calculate Screen Position from Canvas Position ---
    // Transform canvas coords (canvasX, canvasY) to screen coords
    const screenX = canvasX * zoomLevel + offsetX;
    const screenY = canvasY * zoomLevel + offsetY;

    // Position relative to the viewport, considering canvas position and scroll
    const canvasRect = canvas.getBoundingClientRect();
    textarea.style.left = `${canvasRect.left + window.scrollX + screenX}px`;
    textarea.style.top = `${canvasRect.top + window.scrollY + screenY}px`;
    // -----------------------------------------------------

    // Basic styling - Adjust font size based on zoom? Maybe not for input.
    textarea.style.border = '1px solid #ccc';
    textarea.style.padding = '2px';
    // Use a fixed font size for the input element itself, regardless of canvas zoom
    textarea.style.font = `16px Arial`; // Use a fixed size for the input element
    textarea.style.backgroundColor = 'white';
    textarea.style.zIndex = '100';
    textarea.style.resize = 'none';
    textarea.style.overflow = 'hidden';
    textarea.style.whiteSpace = 'pre';
    textarea.rows = 1;

    textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    });

    textarea.addEventListener('blur', handleInputBlur);
    textarea.addEventListener('keydown', handleInputKeyDown);
    textarea.addEventListener('click', (e) => {
        e.stopPropagation();
        textarea.focus();
    });

    document.body.appendChild(textarea);
    activeTextInput = textarea;
    setTimeout(() => {
        textarea.focus();
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    }, 0);
    console.log('Textarea element created, focusing shortly.');
}

// Function to start text input for EDITING an existing shape
function startTextInputForEditing(shapeToEdit) {
    if (activeTextInput) {
        finishTextInput(activeTextInput, false);
    }
    editingTextShape = shapeToEdit;

    const textarea = document.createElement('textarea');
    textarea.style.position = 'absolute';

    // --- Calculate Screen Position from Shape's Canvas Position ---
    const canvasX = shapeToEdit.x;
    const canvasY = shapeToEdit.y;
    const screenX = canvasX * zoomLevel + offsetX;
    const screenY = canvasY * zoomLevel + offsetY;
    const canvasRect = canvas.getBoundingClientRect();
    textarea.style.left = `${canvasRect.left + window.scrollX + screenX}px`;
    textarea.style.top = `${canvasRect.top + window.scrollY + screenY}px`;
    // -----------------------------------------------------------

    // Apply styling from the shape, but use fixed font size for input element
    textarea.style.font = `${shapeToEdit.fontStyle} ${shapeToEdit.fontWeight} 16px ${shapeToEdit.fontFamily}`; // Fixed 16px size
    textarea.style.color = shapeToEdit.color;
    textarea.style.textAlign = shapeToEdit.textAlign;

    textarea.style.border = '1px dashed blue';
    textarea.style.padding = '2px';
    textarea.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    textarea.style.zIndex = '100';
    textarea.style.resize = 'none';
    textarea.style.overflow = 'hidden';
    textarea.style.whiteSpace = 'pre';

    textarea.value = shapeToEdit.text;

    textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    });

    textarea.addEventListener('blur', handleInputBlur);
    textarea.addEventListener('keydown', handleInputKeyDown);
    textarea.addEventListener('click', (e) => {
        e.stopPropagation();
        textarea.focus();
    });

    document.body.appendChild(textarea);
    activeTextInput = textarea;

    setTimeout(() => {
        textarea.focus();
        textarea.select();
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    }, 0);
    console.log('Textarea element created for editing, focusing shortly.');
}


function handleInputBlur(event) {
    console.log('Text input blurred.');
    finishTextInput(event.target, true);
}

function handleInputKeyDown(event) {
    console.log(`Key pressed in input: ${event.key}`);
    event.stopPropagation();

    if (event.key === 'Escape') {
        console.log('Escape pressed in textarea.');
        finishTextInput(event.target, false);
    }
}

function finishTextInput(inputElement, addShape) {
    if (!inputElement || inputElement !== activeTextInput) return;

    const text = inputElement.value;

    if (editingTextShape) {
        if (addShape && text.trim()) {
            editingTextShape.text = text;
            editingTextShape.updateDimensions();
            shapes.push(editingTextShape); // Add back the updated shape
            console.log('Updated text shape:', editingTextShape);
            selectedShape = editingTextShape;
            saveState();
        } else {
            shapes.push(editingTextShape); // Add back the original shape
            console.log('Text edit cancelled or cleared, restoring original shape.');
            selectedShape = editingTextShape;
        }
        editingTextShape = null;
    } else { // Creating new shape
        if (addShape && text.trim()) {
            // --- Get Canvas Position from Input Element's Screen Position ---
            const canvasRect = canvas.getBoundingClientRect();
            const inputRect = inputElement.getBoundingClientRect();
            // Screen position relative to canvas top-left
            const screenX = inputRect.left - canvasRect.left;
            const screenY = inputRect.top - canvasRect.top;
            // Transform back to canvas coordinates
            const canvasX = (screenX - offsetX) / zoomLevel;
            const canvasY = (screenY - offsetY) / zoomLevel;
            // -------------------------------------------------------------

            const newTextShape = new Text(canvasX, canvasY, text, currentColor || '#000000');
            shapes.push(newTextShape);
            console.log('Added new text shape:', newTextShape);
            selectedShape = newTextShape;
            saveState();
        } else {
            console.log('New text input cancelled or empty.');
        }
    }

    // Cleanup
    inputElement.removeEventListener('blur', handleInputBlur);
    inputElement.removeEventListener('keydown', handleInputKeyDown);
    // Remove other listeners if necessary
    document.body.removeChild(inputElement);
    activeTextInput = null;
    editingTextShape = null;
    console.log('Textarea element removed.');
    redrawCanvas();
}

// --- END: Functions for Inline Text Input ---


// --- Double-click listener for editing text ---
canvas.addEventListener('dblclick', (e) => {
    if (activeTextInput) return;

    const mousePos = getMousePos(e); // Use canvas coords
    const mouseX = mousePos.x;
    const mouseY = mousePos.y;

    let clickedTextShape = null;
    for (let i = shapes.length - 1; i >= 0; i--) {
        const shape = shapes[i];
        // Use canvas coords for isInside check
        if (shape instanceof Text && shape.isInside(mouseX, mouseY)) {
            clickedTextShape = shape;
            break;
        }
    }

    if (clickedTextShape) {
        console.log('Editing text shape:', clickedTextShape);
        const index = shapes.indexOf(clickedTextShape);
        if (index > -1) {
            shapes.splice(index, 1);
        }
        selectedShape = null;
        redrawCanvas(); // Redraw without the shape

        // Start editing using the shape's canvas coords
        startTextInputForEditing(clickedTextShape);
    }
});
// ----------------------------------------------------

canvas.addEventListener('mousemove', (e) => {
    const mousePos = getMousePos(e); // Use transformed coordinates
    const mouseX = mousePos.x;
    const mouseY = mousePos.y;
    let cursor = currentCursor;

    // --- Initiate Dragging (using canvas coords) ---
    if (selectedShape && !isDragging && !isResizing && !isRotating && initialMouseDownPos) {
        const dx = mouseX - initialMouseDownPos.x; // Difference in canvas coords
        const dy = mouseY - initialMouseDownPos.y;
        // Drag threshold check still uses pixel distance, but calculated in canvas space
        if (Math.sqrt(dx * dx + dy * dy) * zoomLevel > dragThreshold) { // Scale threshold check
            isDragging = true;
            console.log('Drag threshold exceeded, starting drag.');
            // Calculate drag offset using canvas coords
            dragOffsetX = mouseX - selectedShape.x;
            dragOffsetY = mouseY - selectedShape.y;
            if (selectedShape instanceof Circle) {
                dragOffsetX = mouseX - selectedShape.x;
                dragOffsetY = mouseY - selectedShape.y;
            }
            if (selectedShape instanceof Line) {
                dragOffsetX = mouseX - selectedShape.x1;
                dragOffsetY = mouseY - selectedShape.y1;
                selectedShape.dx = selectedShape.x2 - selectedShape.x1;
                selectedShape.dy = selectedShape.y2 - selectedShape.y1;
            }
            cursor = getCursorForHandle(null); // 'grabbing'
        }
    }

    // --- Handle Rotation (using canvas coords) ---
    if (isRotating && selectedShape && shapeCenter) {
        const dx = mouseX - shapeCenter.x; // Use canvas coords
        const dy = mouseY - shapeCenter.y;
        const currentAngle = Math.atan2(dy, dx);
        let angleDelta = currentAngle - rotationStartAngle;
        selectedShape.angle += angleDelta;
        rotationStartAngle = currentAngle;
        cursor = getCursorForHandle('rotation');
        redrawCanvas();

    // --- Handle Resizing (using canvas coords) ---
    } else if (isResizing && selectedShape && activeHandle && selectedShape.initialCenter) {
        const shape = selectedShape;
        const minSize = handleSize * 2; // Min size in canvas units

        // Initial state is already in canvas units
        const initialX = shape.initialX;
        const initialY = shape.initialY;
        const initialW = shape.initialWidth;
        const initialH = shape.initialHeight;
        const initialAngle = shape.initialAngle;
        const initialCenter = shape.initialCenter;
        const initialRadius = shape.initialRadius;

        // Transform current canvas mouse coords into the shape's initial unrotated frame
        const cosInitial = Math.cos(-initialAngle);
        const sinInitial = Math.sin(-initialAngle);
        const localX = mouseX - initialCenter.x; // Use current canvas mouse coords
        const localY = mouseY - initialCenter.y;
        const transformedMouseX = localX * cosInitial - localY * sinInitial + initialCenter.x;
        const transformedMouseY = localX * sinInitial + localY * cosInitial + initialCenter.y;

        // Calculate new dimensions/position based on handle (using transformed canvas coords)
        let newX = initialX;
        let newY = initialY;
        let newW = initialW;
        let newH = initialH;

        // Calculations remain the same, but use canvas units
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
                 break;
            case 'top-right':
                newW = Math.max(minSize, transformedMouseX - initialX);
                newH = Math.max(minSize, initialY + initialH - transformedMouseY);
                newY = initialY + initialH - newH;
                 break;
            case 'middle-left':
                newW = Math.max(minSize, initialX + initialW - transformedMouseX);
                newX = initialX + initialW - newW;
                 break;
            case 'middle-right':
                newW = Math.max(minSize, transformedMouseX - initialX);
                break;
            case 'bottom-left':
                newW = Math.max(minSize, initialX + initialW - transformedMouseX);
                newH = Math.max(minSize, transformedMouseY - initialY);
                newX = initialX + initialW - newW;
                 break;
            case 'bottom-center':
                 newH = Math.max(minSize, transformedMouseY - initialY);
                break;
            case 'bottom-right':
                 newW = Math.max(minSize, transformedMouseX - initialX);
                 newH = Math.max(minSize, transformedMouseY - initialY);
                break;
        }

        shape.width = newW;
        shape.height = newH;
        shape.x = newX;
        shape.y = newY;

        if (shape instanceof Text) {
            const initialFontSize = shape.initialFontSize || 16;
            const minFontSize = 4;
            if (initialH > 0) {
                 let calculatedFontSize = initialFontSize * (newH / initialH);
                 shape.fontSize = Math.max(minFontSize, calculatedFontSize);
            }
            shape.updateDimensions();
            shape.x = newX; // Re-apply position after dimension update
            shape.y = newY;
        }

        if (shape instanceof Circle) {
            const dx = transformedMouseX - initialCenter.x;
            const dy = transformedMouseY - initialCenter.y;
            let newRadius = Math.sqrt(dx * dx + dy * dy);
            // Simplified radius adjustment for demo
            if (activeHandle.includes('left') || activeHandle.includes('right')) newRadius = Math.abs(dx);
            else if (activeHandle.includes('top') || activeHandle.includes('bottom')) newRadius = Math.abs(dy);
            else newRadius = (Math.abs(dx) + Math.abs(dy)) / 2;

            shape.radius = Math.max(minSize / 2, newRadius);
            shape.x = initialCenter.x; // Keep center fixed
            shape.y = initialCenter.y;
        }

        cursor = getCursorForHandle(activeHandle);
        redrawCanvas();

    // --- Handle Shape Dragging (using canvas coords) ---
    } else if (isDragging && selectedShape) {
        const newX = mouseX - dragOffsetX; // Use canvas coords
        const newY = mouseY - dragOffsetY;

        if (selectedShape instanceof Line) {
            selectedShape.x1 = newX;
            selectedShape.y1 = newY;
            selectedShape.x2 = newX + selectedShape.dx;
            selectedShape.y2 = newY + selectedShape.dy;
            selectedShape.x = newX;
            selectedShape.y = newY;
        } else { // Circle, Rectangle, Diamond, Text
            selectedShape.x = newX;
            selectedShape.y = newY;
        }
        cursor = getCursorForHandle(null); // 'grabbing'
        redrawCanvas();

    // --- Handle Line Drawing Preview (using canvas coords) ---
    } else if (isDrawingLine) {
        tempLineEndX = mouseX; // Use canvas coords
        tempLineEndY = mouseY;
        cursor = 'crosshair';
        redrawCanvas();

    // --- Handle Hovering (check using canvas coords) ---
    } else {
        const handleType = getHandleAt(mouseX, mouseY); // Check handles in canvas coords
        if (handleType) {
            cursor = getCursorForHandle(handleType);
        } else {
             let hoveredShape = null;
             for (let i = shapes.length - 1; i >= 0; i--) {
                 // Use canvas coords for isInside check
                 if (shapes[i].isInside(mouseX, mouseY)) {
                     hoveredShape = shapes[i];
                     break;
                 }
             }
             if (hoveredShape) {
                 cursor = 'move';
             } else {
                 // Set cursor based on active tool
                 if (currentShapeType === 'rectangle' || currentShapeType === 'circle' || currentShapeType === 'diamond' || currentShapeType === 'line') cursor = 'crosshair';
                 else if (currentShapeType === 'text') cursor = 'text';
                 else cursor = 'default';
             }
        }
    }

    // Update canvas cursor style if it changed
    if (cursor !== currentCursor) {
         canvas.style.cursor = cursor;
         currentCursor = cursor;
     }
}); // End mousemove listener

canvas.addEventListener('mouseup', (e) => {
    const mousePos = getMousePos(e); // Use canvas coords
    const mouseX = mousePos.x;
    const mouseY = mousePos.y;
    let stateChanged = false;

    if (isRotating) {
        console.log('Finished rotating shape:', selectedShape);
        isRotating = false;
        activeHandle = null;
        shapeCenter = null;
        stateChanged = true;
        // Cursor updated by mousemove hover logic
    }

    if (isResizing) {
        console.log('Finished resizing shape:', selectedShape);
        isResizing = false;
        activeHandle = null;
        if (selectedShape) { // Clean up initial state properties
            delete selectedShape.initialX; delete selectedShape.initialY;
            delete selectedShape.initialWidth; delete selectedShape.initialHeight;
            delete selectedShape.initialRadius; delete selectedShape.initialAngle;
            delete selectedShape.initialCenter; delete selectedShape.initialMouseX;
            delete selectedShape.initialMouseY; delete selectedShape.initialFontSize;
        }
        stateChanged = true;
        // Cursor updated by mousemove hover logic
    }

    if (isDragging) {
        console.log('Finished dragging shape:', selectedShape);
        isDragging = false;
        stateChanged = true;
        // Cursor updated by mousemove hover logic
    }

    // Finalize line drawing (using canvas coords)
    if (isDrawingLine) {
        // Use final canvas coords from mouseup event
        if (lineStartX !== mouseX || lineStartY !== mouseY) {
            const newLine = new Line(lineStartX, lineStartY, mouseX, mouseY, currentColor);
            shapes.push(newLine);
            console.log('Added new line:', newLine);
            stateChanged = true;
        } else {
             console.log('Line drawing cancelled (start=end).');
         }
        isDrawingLine = false;
        if (stateChanged) {
            setActiveTool('default'); // Reset tool only if line was added
        }
        // Redraw handled below
    }

    if (stateChanged) {
        saveState();
    }

    // Redraw needed if state changed or selection exists, to show final state/cursor
    if (stateChanged || selectedShape) {
        redrawCanvas();
        // Trigger a fake mousemove to update cursor based on final position/state
        const moveEvent = new MouseEvent('mousemove', {
            clientX: e.clientX,
            clientY: e.clientY
        });
        canvas.dispatchEvent(moveEvent);
    }
    initialMouseDownPos = null; // Clear initial position
}); // End mouseup listener

canvas.addEventListener('mouseleave', (e) => {
    let needsRedraw = false;
    if (isDrawingLine) {
        isDrawingLine = false;
        console.log('Line drawing cancelled (mouse left canvas)');
        needsRedraw = true;
    }
    if (isDragging) {
        isDragging = false;
        console.log('Dragging stopped (mouse left canvas)');
        // Optionally snap back or save state here if needed
        needsRedraw = true;
    }
    if (isResizing) {
        isResizing = false; activeHandle = null;
        console.log('Resizing cancelled (mouse left canvas)');
        // Optionally revert changes or save state here if needed
        needsRedraw = true;
    }
    if (isRotating) {
        isRotating = false; activeHandle = null; shapeCenter = null;
        console.log('Rotation cancelled (mouse left canvas)');
        // Optionally revert changes or save state here if needed
        needsRedraw = true;
    }

    if (needsRedraw) {
        redrawCanvas();
    }
    // Reset cursor to default if nothing else is active
    if (!isDragging && !isResizing && !isRotating && !isDrawingLine) {
        canvas.style.cursor = 'default';
        currentCursor = 'default';
    }
    initialMouseDownPos = null;
}); // End mouseleave listener


// --- NEW: Wheel Event Listener for Zooming ---
canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); // Prevent page scrolling

    const rect = canvas.getBoundingClientRect();
    // Mouse position relative to canvas element (screen coords)
    const mouseXScreen = e.clientX - rect.left;
    const mouseYScreen = e.clientY - rect.top;

    // Calculate mouse position in canvas coordinates BEFORE zoom
    const mouseXCanvasBefore = (mouseXScreen - offsetX) / zoomLevel;
    const mouseYCanvasBefore = (mouseYScreen - offsetY) / zoomLevel;

    // Calculate new zoom level
    const zoomFactor = 1.1;
    let newZoomLevel;
    if (e.deltaY < 0) { // Zoom in
        newZoomLevel = zoomLevel * zoomFactor;
    } else { // Zoom out
        newZoomLevel = zoomLevel / zoomFactor;
    }
    // Clamp zoom level
    newZoomLevel = Math.max(minZoom, Math.min(maxZoom, newZoomLevel));

    // Calculate the change in offset to keep the point under the mouse stationary
    offsetX = mouseXScreen - mouseXCanvasBefore * newZoomLevel;
    offsetY = mouseYScreen - mouseYCanvasBefore * newZoomLevel;

    // Update zoom level
    zoomLevel = newZoomLevel;

    console.log(`Zoom: ${zoomLevel.toFixed(2)}, Offset: (${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})`);
    redrawCanvas();

    // Update cursor based on new zoom/position
    const moveEvent = new MouseEvent('mousemove', { clientX: e.clientX, clientY: e.clientY });
    canvas.dispatchEvent(moveEvent);
});
// -----------------------------------------


// Delete selected shape / Handle global keys
document.addEventListener('keydown', (e) => {
    if (activeTextInput) { // Let text input handle keys
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
        // Cancel any ongoing actions associated with the deleted shape
        isDrawingLine = false;
        isResizing = false; activeHandle = null;
        isRotating = false; shapeCenter = null;
        isDragging = false; // Also cancel dragging if somehow active

        redrawCanvas();
        saveState();
    }

    // --- Potential Future Keybindings (e.g., panning with arrow keys) ---
    // if (e.key === 'ArrowUp') { offsetX += 10; redrawCanvas(); }
    // etc.
}); // End keydown listener


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

// --- Setup IPC Listeners from Main ---
window.electronAPI.onUndo(undo);
window.electronAPI.onRedo(redo);
// The listener for onRequestSave is already defined above (around line 1758)
window.electronAPI.onCopyCanvas(handleCopyCanvas); // Listen for copy command
window.electronAPI.onPasteCanvas(handlePasteCanvas); // Listen for paste command

// --- NEW: Flip Button Event Listeners ---
const flipHorizontalButton = document.getElementById('flipHorizontalButton');
const flipVerticalButton = document.getElementById('flipVerticalButton');

if (flipHorizontalButton) {
    flipHorizontalButton.addEventListener('click', () => {
        if (selectedShape) {
            saveState(); // Save state before modification
            selectedShape.flipH = !selectedShape.flipH;
            console.log('Horizontal flip:', selectedShape.flipH, 'Vertical flip:', selectedShape.flipV, selectedShape);
            redrawCanvas();
        }
    });
} else {
    console.error("Flip Horizontal button not found!");
}

if (flipVerticalButton) {
    flipVerticalButton.addEventListener('click', () => {
        if (selectedShape) {
            saveState(); // Save state before modification
            selectedShape.flipV = !selectedShape.flipV;
            console.log('Vertical flip:', selectedShape.flipV, 'Horizontal flip:', selectedShape.flipH, selectedShape);
            redrawCanvas();
        }
    });
} else {
    console.error("Flip Vertical button not found!");
}
