// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const canvas = document.getElementById('flowchartCanvas');
const ctx = canvas.getContext('2d');
const toolbar = document.getElementById('toolbar');
const colorPicker = document.getElementById('colorPicker');
const savePngButton = document.getElementById('savePng');
const saveJpgButton = document.getElementById('saveJpg');

let shapes = []; // Array to hold all shapes on the canvas
let selectedShape = null;
let isDragging = false;
let dragStartX, dragStartY;
let currentShapeType = 'rectangle'; // Default shape
let currentColor = '#ffffff'; // Default color

// --- Shape Drawing Functions ---

function drawRectangle(x, y, width, height, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#000000'; // Black border
    ctx.strokeRect(x, y, width, height);
}

function drawCircle(x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.stroke();
}

function drawDiamond(x, y, width, height, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + width / 2, y); // Top point
    ctx.lineTo(x + width, y + height / 2); // Right point
    ctx.lineTo(x + width / 2, y + height); // Bottom point
    ctx.lineTo(x, y + height / 2); // Left point
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.stroke();
}

// --- Canvas Redraw ---

function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas
    // Optional: Draw grid or background
    // ctx.fillStyle = '#f0f0f0';
    // ctx.fillRect(0, 0, canvas.width, canvas.height);

    shapes.forEach(shape => {
        switch (shape.type) {
            case 'rectangle':
                drawRectangle(shape.x, shape.y, shape.width, shape.height, shape.color);
                break;
            case 'circle':
                drawCircle(shape.x, shape.y, shape.radius, shape.color);
                break;
            case 'diamond':
                drawDiamond(shape.x, shape.y, shape.width, shape.height, shape.color);
                break;
        }
    });
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

    // Check if clicking on an existing shape
    selectedShape = null; // Deselect first
    for (let i = shapes.length - 1; i >= 0; i--) {
        const shape = shapes[i];
        // Basic bounding box check (improve for circles/diamonds later)
        let isInside = false;
        if (shape.type === 'rectangle' || shape.type === 'diamond') {
             isInside = mouseX >= shape.x && mouseX <= shape.x + shape.width &&
                        mouseY >= shape.y && mouseY <= shape.y + shape.height;
        } else if (shape.type === 'circle') {
            const dx = mouseX - shape.x;
            const dy = mouseY - shape.y;
            isInside = dx * dx + dy * dy <= shape.radius * shape.radius;
        }

        if (isInside) {
            selectedShape = shape;
            isDragging = true;
            dragStartX = mouseX - shape.x;
            dragStartY = mouseY - shape.y;
            // Bring selected shape to front (optional, redraws all)
            shapes.splice(i, 1);
            shapes.push(selectedShape);
            redrawCanvas();
            console.log('Selected existing shape:', selectedShape);
            return; // Stop after finding the top-most shape
        }
    }

    // If not clicking on an existing shape, add a new one
    if (!selectedShape) {
        isDragging = false; // Reset dragging flag
        let newShape;
        const defaultWidth = 100;
        const defaultHeight = 60;
        const defaultRadius = 40;

        switch (currentShapeType) {
            case 'rectangle':
                newShape = { type: 'rectangle', x: mouseX - defaultWidth / 2, y: mouseY - defaultHeight / 2, width: defaultWidth, height: defaultHeight, color: currentColor };
                break;
            case 'circle':
                newShape = { type: 'circle', x: mouseX, y: mouseY, radius: defaultRadius, color: currentColor };
                break;
            case 'diamond':
                 newShape = { type: 'diamond', x: mouseX - defaultWidth / 2, y: mouseY - defaultHeight / 2, width: defaultWidth, height: defaultHeight, color: currentColor };
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

        selectedShape.x = mouseX - dragStartX;
        selectedShape.y = mouseY - dragStartY;

        redrawCanvas();
    }
});

canvas.addEventListener('mouseup', () => {
    if (isDragging) {
        console.log('Finished dragging shape:', selectedShape);
    }
    isDragging = false;
});

canvas.addEventListener('mouseleave', () => {
    // Optional: Stop dragging if mouse leaves canvas
    // if (isDragging) {
    //     console.log('Dragging stopped (mouse left canvas)');
    // }
    // isDragging = false;
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
