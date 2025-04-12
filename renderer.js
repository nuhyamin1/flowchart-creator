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
let currentColor = '#000000'; // Default color changed to black

// --- NEW State variables for Line Drawing ---
let isDrawingLine = false;
let lineStartX, lineStartY;
let tempLineEndX, tempLineEndY; // For drawing temporary line in mousemove

// --- Shape Classes ---

class Shape {
    constructor(x, y, color) {
        this.x = x; // Typically top-left or center x
        this.y = y; // Typically top-left or center y
        this.color = color;
    }

    draw(ctx) {
        throw new Error("Draw method must be implemented by subclass");
    }

    isInside(mouseX, mouseY) {
        throw new Error("isInside method must be implemented by subclass");
    }
}

class Rectangle extends Shape {
    constructor(x, y, width, height, color) {
        super(x, y, color);
        this.width = width;
        this.height = height;
        this.type = 'rectangle';
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeStyle = '#000000'; // Black border
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
    }

    isInside(mouseX, mouseY) {
        return mouseX >= this.x && mouseX <= this.x + this.width &&
               mouseY >= this.y && mouseY <= this.y + this.height;
    }
}

class Circle extends Shape {
    constructor(x, y, radius, color) {
        super(x, y, color); // Circle's x, y is the center
        this.radius = radius;
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
}

class Diamond extends Shape {
    constructor(x, y, width, height, color) {
        super(x, y, color); // Diamond's x, y is the top-left corner of the bounding box
        this.width = width;
        this.height = height;
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
         // Basic bounding box check
         return mouseX >= this.x && mouseX <= this.x + this.width &&
                mouseY >= this.y && mouseY <= this.y + this.height;
        // Note: A more accurate check would test point-in-polygon.
    }
}

// --- NEW Line Class ---
class Line extends Shape {
    constructor(x1, y1, x2, y2, color) {
        // For lines, x/y could represent the starting point
        super(x1, y1, color);
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.type = 'line';
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.moveTo(this.x1, this.y1);
        ctx.lineTo(this.x2, this.y2);
        ctx.strokeStyle = this.color; // Use the shape's color for the line stroke
        ctx.lineWidth = 2; // Make lines a bit thicker
        ctx.stroke();
        ctx.lineWidth = 1; // Reset line width
    }

    // Simple check: is the mouse point close to the line segment?
    // This is a basic implementation for demonstration.
    isInside(mouseX, mouseY) {
        const tolerance = 5; // How close the mouse needs to be (in pixels)
        const dx = this.x2 - this.x1;
        const dy = this.y2 - this.y1;
        const lenSq = dx * dx + dy * dy; // Squared length of the line

        if (lenSq === 0) { // Check if start and end points are the same
            const distSq = Math.pow(mouseX - this.x1, 2) + Math.pow(mouseY - this.y1, 2);
            return distSq <= tolerance * tolerance;
        }

        // Calculate the parameter 't' which represents the projection of the mouse point onto the line
        let t = ((mouseX - this.x1) * dx + (mouseY - this.y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t)); // Clamp 't' to the range [0, 1] to stay within the segment

        // Calculate the closest point on the line segment to the mouse point
        const closestX = this.x1 + t * dx;
        const closestY = this.y1 + t * dy;

        // Calculate the distance between the mouse point and the closest point on the line segment
        const distSq = Math.pow(mouseX - closestX, 2) + Math.pow(mouseY - closestY, 2);

        return distSq <= tolerance * tolerance;
    }
}


// --- Canvas Redraw ---

function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all permanent shapes (including lines)
    shapes.forEach(shape => {
        shape.draw(ctx);
    });

    // --- NEW: Draw temporary line if currently drawing one ---
    if (isDrawingLine) {
        ctx.beginPath();
        ctx.moveTo(lineStartX, lineStartY);
        ctx.lineTo(tempLineEndX, tempLineEndY);
        ctx.strokeStyle = currentColor; // Use current selected color
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // Optional: make temporary line dashed
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash
        ctx.lineWidth = 1; // Reset line width
    }
    // ---------------------------------------------------------

    // Highlight selected shape (if it's not a line, or handle line highlight differently)
    if (selectedShape) {
        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 2;
         // Re-draw border/outline for visual feedback
        if (selectedShape instanceof Rectangle || selectedShape instanceof Diamond) {
            ctx.strokeRect(selectedShape.x, selectedShape.y, selectedShape.width, selectedShape.height);
        } else if (selectedShape instanceof Circle) {
            ctx.beginPath();
            ctx.arc(selectedShape.x, selectedShape.y, selectedShape.radius, 0, Math.PI * 2);
            ctx.stroke();
        } else if (selectedShape instanceof Line) {
            // Draw line slightly thicker or different color to indicate selection
            ctx.beginPath();
            ctx.moveTo(selectedShape.x1, selectedShape.y1);
            ctx.lineTo(selectedShape.x2, selectedShape.y2);
            ctx.stroke(); // Already blue and thicker due to settings above
        }
        ctx.strokeStyle = 'black'; // Reset for other shapes/drawing
        ctx.lineWidth = 1;
    }
}

// --- Event Listeners ---

// Toolbar shape selection
toolbar.addEventListener('click', (e) => {
    if (e.target.classList.contains('shape')) {
        // If switching away from line drawing mode, cancel it
        if (isDrawingLine && e.target.getAttribute('data-shape') !== 'line') {
             isDrawingLine = false;
             redrawCanvas(); // Remove temporary line if switching tool
             console.log('Line drawing cancelled by switching tool.');
        }

        document.querySelectorAll('.shape.selected').forEach(el => el.classList.remove('selected'));
        e.target.classList.add('selected');
        currentShapeType = e.target.getAttribute('data-shape');
        console.log(`Selected shape type: ${currentShapeType}`);

        // Deselect any shape when changing tool
        selectedShape = null;
        redrawCanvas();
    }
});

// Color selection
colorPicker.addEventListener('input', (e) => {
    currentColor = e.target.value;
    console.log(`Selected color: ${currentColor}`);
    if (selectedShape) {
        selectedShape.color = currentColor;
        redrawCanvas();
    }
});

// Canvas interaction
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // --- MODIFIED: Handle Line Drawing Start ---
    if (currentShapeType === 'line') {
        isDrawingLine = true;
        lineStartX = mouseX;
        lineStartY = mouseY;
        tempLineEndX = mouseX; // Initialize temp end point
        tempLineEndY = mouseY;
        selectedShape = null; // Deselect any shape when starting a line
        isDragging = false; // Ensure not in shape dragging mode
        console.log(`Starting line at (${lineStartX}, ${lineStartY})`);
        redrawCanvas(); // Redraw to show potential start point or clear selection
        return; // Don't proceed to shape selection/creation logic below
    }
    // ----------------------------------------

    // If not drawing a line, check for selecting/dragging existing shapes
    isDrawingLine = false; // Make sure line drawing mode is off
    let clickedShape = null;
    for (let i = shapes.length - 1; i >= 0; i--) {
        const shape = shapes[i];
        if (shape.isInside(mouseX, mouseY)) {
            clickedShape = shape;
            break;
        }
    }

    if (clickedShape) {
        selectedShape = clickedShape;
        isDragging = true;
        // Calculate offset based on shape type
        if (selectedShape instanceof Circle) {
             dragOffsetX = mouseX - selectedShape.x; // Center x
             dragOffsetY = mouseY - selectedShape.y; // Center y
        } else if (selectedShape instanceof Line) {
            // Dragging lines might need special handling (move endpoints?)
            // For now, let's drag the whole line based on its start point (this.x, this.y)
             dragOffsetX = mouseX - selectedShape.x1;
             dragOffsetY = mouseY - selectedShape.y1;
             // Store the original difference between start and end points
             selectedShape.dx = selectedShape.x2 - selectedShape.x1;
             selectedShape.dy = selectedShape.y2 - selectedShape.y1;
             console.log('Dragging line');
        } else { // Rectangle, Diamond (using top-left corner)
             dragOffsetX = mouseX - selectedShape.x;
             dragOffsetY = mouseY - selectedShape.y;
        }


        shapes.splice(shapes.indexOf(selectedShape), 1);
        shapes.push(selectedShape);
        colorPicker.value = selectedShape.color;
        currentColor = selectedShape.color;
        redrawCanvas();
        console.log('Selected existing shape:', selectedShape);

    } else {
        // Add a new Rectangle/Circle/Diamond (not Line, handled above)
        selectedShape = null;
        isDragging = false;
        let newShape;
        const defaultWidth = 100;
        const defaultHeight = 60;
        const defaultRadius = 40;
        const shapeX = mouseX - defaultWidth / 2;
        const shapeY = mouseY - defaultHeight / 2;
        const circleCenterX = mouseX;
        const circleCenterY = mouseY;

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
            // 'line' case is handled earlier in mousedown
        }

        if (newShape) {
            shapes.push(newShape);
            selectedShape = newShape; // Select the new shape
            redrawCanvas();
            console.log('Added new shape:', newShape);
        } else {
            // If clicked background and not adding shape, deselect
             redrawCanvas();
             console.log('Clicked background, deselected shape.');
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // --- MODIFIED: Update temporary line ---
    if (isDrawingLine) {
        tempLineEndX = mouseX;
        tempLineEndY = mouseY;
        redrawCanvas(); // Redraw to show the temporary line moving
        return; // Don't do shape dragging logic
    }
    // ---------------------------------------

    if (isDragging && selectedShape) {
         // Update position based on drag offset
        const newX = mouseX - dragOffsetX;
        const newY = mouseY - dragOffsetY;

        if (selectedShape instanceof Line) {
            // Move both endpoints of the line
            selectedShape.x1 = newX;
            selectedShape.y1 = newY;
            selectedShape.x2 = newX + selectedShape.dx; // Maintain original vector
            selectedShape.y2 = newY + selectedShape.dy;
            // Update base x/y for consistency if needed (optional)
            selectedShape.x = newX;
            selectedShape.y = newY;
        } else {
            // For other shapes (Rectangle, Circle, Diamond), just update x, y
            selectedShape.x = newX;
            selectedShape.y = newY;
        }

        redrawCanvas();
    }
});

canvas.addEventListener('mouseup', (e) => {
    // --- MODIFIED: Finalize Line Drawing ---
    if (isDrawingLine) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Only add line if it has some length (optional check)
        if (lineStartX !== mouseX || lineStartY !== mouseY) {
             const newLine = new Line(lineStartX, lineStartY, mouseX, mouseY, currentColor);
             shapes.push(newLine);
             console.log('Added new line:', newLine);
        } else {
            console.log('Line drawing cancelled (start=end).');
        }
        isDrawingLine = false; // Stop drawing line mode
        // selectedShape = newLine; // Optionally select the new line
        redrawCanvas(); // Redraw without temporary line, with the new permanent one
        return; // Don't do shape dragging logic
    }
    // ----------------------------------------

    if (isDragging) {
        console.log('Finished dragging shape:', selectedShape);
        // Keep the shape selected
    }
    isDragging = false; // Stop dragging mode regardless
});

canvas.addEventListener('mouseleave', () => {
    // --- MODIFIED: Cancel Line Drawing if mouse leaves ---
    if (isDrawingLine) {
        isDrawingLine = false;
        console.log('Line drawing cancelled (mouse left canvas)');
        redrawCanvas(); // Remove temporary line
    }
    // -------------------------------------------------
    if (isDragging) {
        console.log('Dragging stopped (mouse left canvas)');
        isDragging = false;
    }
});

// Deselect shape if clicking outside (this logic might need review with line drawing)
// Current mousedown handles deselecting when clicking background without starting a shape/line
// Let's remove the separate 'click' listener for deselection as mousedown covers it.
/*
canvas.addEventListener('click', (e) => {
    // ... (previous deselection logic removed) ...
});
*/

// Delete selected shape with Delete/Backspace key
document.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShape) {
        console.log('Deleting shape:', selectedShape);
        const index = shapes.indexOf(selectedShape);
        if (index > -1) {
            shapes.splice(index, 1);
        }
        selectedShape = null;
        // If currently drawing a line when delete is pressed, cancel line drawing
        if (isDrawingLine) {
             isDrawingLine = false;
             console.log("Line drawing cancelled by delete key.");
        }
        redrawCanvas();
    }
});


// --- Save Functionality --- (Keep existing save functions)

async function saveCanvasToFile(format) {
    let dataURL;
    let filter;

    // Deselect shape before saving for a clean image
    selectedShape = null;
    redrawCanvas(); // Redraw without selection highlight

    if (format === 'png') {
        dataURL = canvas.toDataURL('image/png');
        filter = { name: 'PNG Images', extensions: ['png'] };
    } else if (format === 'jpg') {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = '#FFFFFF';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(canvas, 0, 0);
        dataURL = tempCanvas.toDataURL('image/jpeg', 0.9);
        filter = { name: 'JPEG Images', extensions: ['jpg', 'jpeg'] };
    } else {
        console.error('Unsupported save format:', format);
        return;
    }

    try {
        const result = await window.electronAPI.saveDialog(filter);

        if (!result.canceled && result.filePath) {
            console.log(`Saving ${format.toUpperCase()} to:`, result.filePath);
            const writeResult = await window.electronAPI.writeFile(result.filePath, dataURL);
            if (writeResult.success) {
                alert(`Flowchart saved successfully as ${result.filePath}`);
                console.log('File saved successfully.');
            } else {
                throw new Error(writeResult.error || 'Unknown error writing file');
            }
        } else {
            console.log('Save operation canceled.');
        }
    } catch (error) {
        console.error(`Error saving ${format.toUpperCase()}:`, error);
        alert(`Failed to save flowchart: ${error.message}`);
    }
}

savePngButton.addEventListener('click', () => {
    saveCanvasToFile('png');
});

saveJpgButton.addEventListener('click', () => {
    saveCanvasToFile('jpg');
});


// --- Initial Draw ---
// Set canvas background (optional, helps if shapes are white)
canvas.style.backgroundColor = '#f0f0f0'; // Light grey background

// Initialize color picker to the default color
colorPicker.value = currentColor;

redrawCanvas();
console.log('Renderer process loaded.');

// Select Rectangle by default visually
document.querySelector('.shape[data-shape="rectangle"]').classList.add('selected');