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
let currentColor = '#ffffff'; // Default color

// --- Shape Classes ---

class Shape {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
    }

    // Abstract methods - to be implemented by subclasses
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
        ctx.stroke();
    }

    // Using bounding box for simplicity, could be more precise
    isInside(mouseX, mouseY) {
        // More accurate check would involve checking if point is within the 4 lines
        // For now, use bounding box check like rectangle
         return mouseX >= this.x && mouseX <= this.x + this.width &&
                mouseY >= this.y && mouseY <= this.y + this.height;
    }
}


// --- Canvas Redraw ---

function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas
    // Optional: Draw grid or background
    // ctx.fillStyle = '#f0f0f0';
    // ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw shapes from bottom up (important for overlap/selection)
    shapes.forEach(shape => {
        shape.draw(ctx);
    });

    // Optional: Highlight selected shape
    if (selectedShape) {
        // Example: Draw a thicker border or handles
        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 2;
        // Re-draw the selected shape's border slightly differently
        if (selectedShape instanceof Rectangle || selectedShape instanceof Diamond) {
             ctx.strokeRect(selectedShape.x, selectedShape.y, selectedShape.width, selectedShape.height);
        } else if (selectedShape instanceof Circle) {
             ctx.beginPath();
             ctx.arc(selectedShape.x, selectedShape.y, selectedShape.radius, 0, Math.PI * 2);
             ctx.stroke();
        }
        ctx.strokeStyle = 'black'; // Reset for other shapes
        ctx.lineWidth = 1;
    }
}

// --- Event Listeners ---

// Toolbar shape selection
toolbar.addEventListener('click', (e) => {
    if (e.target.classList.contains('shape')) {
        // Remove selection style from previous
        document.querySelectorAll('.shape.selected').forEach(el => el.classList.remove('selected'));
        // Add selection style to current
        e.target.classList.add('selected');
        currentShapeType = e.target.getAttribute('data-shape');
        console.log(`Selected shape type: ${currentShapeType}`);
    }
});

// Color selection
colorPicker.addEventListener('input', (e) => {
    currentColor = e.target.value;
    console.log(`Selected color: ${currentColor}`);
    // If a shape is selected, update its color directly
    if (selectedShape) {
        selectedShape.color = currentColor;
        redrawCanvas();
    }
});

// Canvas interaction (Add shape, Select, Drag)
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check if clicking on an existing shape (iterate backwards for top-most)
    let clickedShape = null;
    for (let i = shapes.length - 1; i >= 0; i--) {
        const shape = shapes[i];
        if (shape.isInside(mouseX, mouseY)) {
            clickedShape = shape;
            break; // Found the top-most shape under the cursor
        }
    }

    if (clickedShape) {
        // Select the clicked shape
        selectedShape = clickedShape;
        isDragging = true;
        // Calculate offset from shape's origin (top-left or center)
        dragOffsetX = mouseX - selectedShape.x;
        dragOffsetY = mouseY - selectedShape.y;

        // Bring selected shape to the end of the array (drawn last/on top)
        shapes.splice(shapes.indexOf(selectedShape), 1);
        shapes.push(selectedShape);

        // Update color picker to match selected shape's color
        colorPicker.value = selectedShape.color;
        currentColor = selectedShape.color; // Sync internal state too

        redrawCanvas();
        console.log('Selected existing shape:', selectedShape);

    } else {
        // If not clicking an existing shape, add a new one
        selectedShape = null; // Deselect any previously selected shape
        isDragging = false;
        let newShape;
        const defaultWidth = 100;
        const defaultHeight = 60;
        const defaultRadius = 40; // For circle

        // Center the shape on the click coordinates
        const shapeX = mouseX - defaultWidth / 2;
        const shapeY = mouseY - defaultHeight / 2;
        const circleCenterX = mouseX;
        const circleCenterY = mouseY;


        switch (currentShapeType) {
            case 'rectangle':
                newShape = new Rectangle(shapeX, shapeY, defaultWidth, defaultHeight, currentColor);
                break;
            case 'circle':
                // For circle, x/y is center, so use click coords directly
                newShape = new Circle(circleCenterX, circleCenterY, defaultRadius, currentColor);
                break;
            case 'diamond':
                 newShape = new Diamond(shapeX, shapeY, defaultWidth, defaultHeight, currentColor);
                break;
        }

        if (newShape) {
            shapes.push(newShape);
            selectedShape = newShape; // Select the newly added shape
            redrawCanvas();
            console.log('Added new shape:', newShape);
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isDragging && selectedShape) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Update position based on drag offset
        selectedShape.x = mouseX - dragOffsetX;
        selectedShape.y = mouseY - dragOffsetY;

        redrawCanvas();
    }
});

canvas.addEventListener('mouseup', () => {
    if (isDragging) {
        console.log('Finished dragging shape:', selectedShape);
        // Keep the shape selected after dragging stops
    }
    isDragging = false;
});

canvas.addEventListener('mouseleave', () => {
    // Stop dragging if mouse leaves canvas while dragging
    if (isDragging) {
        console.log('Dragging stopped (mouse left canvas)');
        isDragging = false;
        // Keep the shape selected
    }
});

// Deselect shape if clicking outside any shape
canvas.addEventListener('click', (e) => {
    if (!isDragging) { // Only deselect if not currently dragging
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let clickedOnShape = false;
        for (let i = shapes.length - 1; i >= 0; i--) {
            if (shapes[i].isInside(mouseX, mouseY)) {
                clickedOnShape = true;
                break;
            }
        }

        if (!clickedOnShape) {
            selectedShape = null;
            redrawCanvas();
            console.log('Deselected shape (clicked background)');
        }
    }
});

// Delete selected shape with Delete/Backspace key
document.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShape) {
        console.log('Deleting shape:', selectedShape);
        const index = shapes.indexOf(selectedShape);
        if (index > -1) {
            shapes.splice(index, 1); // Remove the shape from the array
        }
        selectedShape = null; // Deselect
        redrawCanvas(); // Update the canvas
    }
});


// --- Save Functionality ---

async function saveCanvasToFile(format) {
    let dataURL;
    let filter;

    if (format === 'png') {
        dataURL = canvas.toDataURL('image/png');
        filter = { name: 'PNG Images', extensions: ['png'] };
    } else if (format === 'jpg') {
        // Draw canvas onto a white background for JPG
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = '#FFFFFF'; // White background
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(canvas, 0, 0); // Draw original canvas content
        dataURL = tempCanvas.toDataURL('image/jpeg', 0.9); // Quality 0.9
        filter = { name: 'JPEG Images', extensions: ['jpg', 'jpeg'] };
    } else {
        console.error('Unsupported save format:', format);
        return;
    }

    try {
        // Use the exposed electronAPI from preload.js
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
redrawCanvas();
console.log('Renderer process loaded.');

// Select Rectangle by default visually
document.querySelector('.shape[data-shape="rectangle"]').classList.add('selected');
