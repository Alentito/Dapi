const javascriptGenerator = Blockly.JavaScript;
console.log(javascriptGenerator);
const workspace = Blockly.inject("blocklyDiv", {
  toolbox: document.getElementById("toolbox"),
  zoom: {
    controls: true,
    wheel: true,
    startScale: 1.0,
    maxScale: 3,
    minScale: 0.3,
    scaleSpeed: 1.2,
    pinch: false,
  },
  grid: {
    spacing: 20,
    length: 2,
    colour: "#ccc",
    snap: true,
  },
  trashcan: true,
});

// Handle Blockly resize
const resizeBlockly = () => {
  Blockly.svgResize(workspace);
};

// Resize Blockly after window resize or manual div resize
window.addEventListener('resize', resizeBlockly);
document.addEventListener('mouseup', resizeBlockly);


const socket = io("http://localhost:5000");

// Define blocks
Blockly.defineBlocksWithJsonArray([
  {
    type: "takeoff",
    message0: "Takeoff",
    previousStatement: null,
    colour: 160,
    nextStatement: null,
  },
  {
    type: "takeoff_after",
    message0: "Takeoff after %1 seconds",
    args0: [{ type: "field_number", name: "TIME", value: 1 }],
    previousStatement: null,
    nextStatement: null,
  },
  {
    type: "wait",
    message0: "Wait %1 seconds",
    args0: [{ type: "field_number", name: "TIME", value: 1 }],
    previousStatement: null,
    nextStatement: null,
  },
  {
    type: "fly",
    message0: "Fly %1 %2 meters",
    args0: [
      {
        type: "field_dropdown",
        name: "DIRECTION",
        options: [
          ["forward", "F"],
          ["backward", "B"],
          ["left", "L"],
          ["right", "R"],
          ["up", "U"],
          ["down", "D"],
        ],
      },
      { type: "field_number", name: "VALUE", value: 1 },
    ],
    previousStatement: null,
    nextStatement: null,
  },
  {
    type: "circle",
    message0: "Circle %1 with %2 radius",
    args0: [
      {
        type: "field_dropdown",
        name: "DIRECTION",
        options: [
          ["left", "CL"],
          ["right", "CR"],
        ],
      },
      { type: "field_number", name: "VALUE", value: 1 },
    ],
    previousStatement: null,
    nextStatement: null,
  },
  {
    type: "yaw",
    message0: "Yaw %1 %2 degrees",
    args0: [
      {
        type: "field_dropdown",
        name: "DIRECTION",
        options: [
          ["left", "YL"],
          ["right", "YR"],
        ],
      },
      { type: "field_number", name: "VALUE", value: 30 },
    ],
    previousStatement: null,
    nextStatement: null,
  },
  {
    type: "land",
    message0: "Land",
    previousStatement: null,
    nextStatement: null,
  },
  {
    type: "land_after",
    message0: "Land for %1 seconds then takeoff",
    args0: [{ type: "field_number", name: "TIME", value: 2 }],
    previousStatement: null,
    nextStatement: null,
  },
]);

// Convert Blockly code to JS & send to Flask
// Convert Blockly code to JS & send to Flask
document.getElementById("runButton").addEventListener("click", async () => {
  let code = Blockly.JavaScript.workspaceToCode(workspace);
  console.log(code);
  let commands = code
  .split("\n")
  .map(cmd => cmd.trim()) // Trim whitespace
  .filter(cmd => cmd.startsWith("executeCommand"))
  .map(cmd => cmd.replace(/executeCommand\(|\);/g, "").replace(/['"]/g, "")); // Remove function calls

console.log(commands);
  for (let i = 0; i < commands.length; i++) {
    await new Promise((resolve) => {
      executeCommand(commands[i]);
      setTimeout(resolve, 1500); // Ensure time for movement
    });
  }
});

// Define JavaScript code generation for custom blocks
javascriptGenerator.forBlock["takeoff"] = function (block, generator) {
  return 'executeCommand("takeoff");\n';
};

javascriptGenerator.forBlock["takeoff_after"] = function (block, generator) {
  let time = block.getFieldValue("TIME");
  return `await new Promise(resolve => setTimeout(() => { executeCommand("takeoff"); resolve(); }, ${time} * 1000));\n`;
};

javascriptGenerator.forBlock["land"] = function (block, generator) {
  return 'executeCommand("land");\n';
};

javascriptGenerator.forBlock["land_after"] = function (block, generator) {
  let time = block.getFieldValue("TIME");
  return `await new Promise(resolve => setTimeout(() => { executeCommand("land"); resolve(); }, ${time} * 1000));\n`;
};

javascriptGenerator.forBlock["fly"] = function (block, generator) {
  let direction = block.getFieldValue("DIRECTION"); // "forward", "backward", etc.
  let value = block.getFieldValue("VALUE"); // Distance in meters

  // Ensure the command uses the correct values
  return `executeCommand("fly ${direction} ${value}");\n`;
};

javascriptGenerator.forBlock["circle"] = function (block, generator) {
  let direction = block.getFieldValue("DIRECTION"); // "CL" for counter-clockwise, "CR" for clockwise
  let radius = block.getFieldValue("VALUE"); // Radius of the circle
  
  return `executeCommand("circle ${direction} ${radius}");\n`;
};

javascriptGenerator.forBlock["yaw"] = function (block, generator) {
  let direction = block.getFieldValue("DIRECTION");
  let value = block.getFieldValue("VALUE");
  return `executeCommand("yaw ${direction} ${value}");\n`;
};

const generatedCodeElement = document.getElementById("generatedCode");

workspace.addChangeListener(() => {
  const code = javascriptGenerator.workspaceToCode(workspace);

  generatedCodeElement.innerHTML = `<code class="language-javascript">${Prism.highlight(
    code,
    Prism.languages.javascript,
    "javascript"
  )}</code>`;

  const previewContainer = document.getElementById("codeOutput");
  previewContainer.scrollTop = previewContainer.scrollHeight;
});

// Initialize Three.js Scene
//import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
// import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";





const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  30,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const container = document.getElementById("simulatorContainer");
const width = container.clientWidth;
const height = container.clientHeight;

renderer.shadowMap.enabled = true;




renderer.setSize(width, height);
container.appendChild(renderer.domElement);

//Add Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Smooth camera movement
controls.dampingFactor = 0.05; // Damping speed
controls.screenSpacePanning = false; // Prevent awkward panning
controls.maxPolarAngle = Math.PI / 2; // Restrict camera movement below ground

// Add lighting
// const light = new THREE.AmbientLight(0xffffff, 1);
// scene.add(light);

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 5, 5);
light.castShadow = true;
scene.add(light);

const listener = new THREE.AudioListener();
camera.add(listener); // Attach audio listener to the camera

const sound = new THREE.PositionalAudio(listener);
const audioLoader = new THREE.AudioLoader();



// ✅ Load drone sound
audioLoader.load("./hover.mp3", (buffer) => {
    sound.setBuffer(buffer);
    sound.setLoop(true); // ✅ Make it loop
    sound.setVolume(0.5); // Adjust volume as needed
});

//Create a Ground Plane
const groundGeometry = new THREE.PlaneGeometry(50, 50);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2; // Make it flat
ground.receiveShadow = true;
scene.add(ground);



// ✅ Add Grid Helper (like in 3D editors)
const gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x888888); 
gridHelper.position.y = 0.01; // Slightly above the ground to avoid z-fighting
scene.add(gridHelper);

// ✅ Optional: Add Axes Helper (to visualize X, Y, Z)
// const axesHelper = new THREE.AxesHelper(10);
// scene.add(axesHelper);

const loader = new GLTFLoader();
let drone, propellers = [], propellerRotation = false; 

// ✅ Load GLTF Model
loader.load("./drone.gltf", (gltf) => {
    drone = gltf.scene;
    drone.add(sound);
    drone.castShadow = true;
    scene.add(drone);
    

    // ✅ Find all propellers by name
    propellers = [
        drone.getObjectByName("prop"),
        drone.getObjectByName("prop_1"),
        drone.getObjectByName("prop_2"),
        drone.getObjectByName("prop_3"),
    ].filter(prop => prop !== null); // Remove any null values

    console.log("Loaded Drone:", drone);
    console.log("Propellers Found:", propellers);
});

let trailMaterial, trailGeometry, trailLine;
let trailPositions = []; // To store the positions for the trail

// Initialize the trail
function initTrail() {
    trailMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 }); // Red trail
    trailGeometry = new THREE.BufferGeometry();
    trailLine = new THREE.Line(trailGeometry, trailMaterial);
    scene.add(trailLine);
}

// Update the trail with the current drone position
function updateTrail() {
    // Add the current position to the trail
    trailPositions.push(drone.position.x, drone.position.y, drone.position.z);

    // Limit the trail length (optional for performance)
    const maxPoints = 500;
    if (trailPositions.length > maxPoints * 3) {
        trailPositions.splice(0, 3); // Remove oldest point
    }

    // Update the geometry with the new trail positions
    trailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(trailPositions, 3));
    trailGeometry.computeBoundingSphere(); // Update bounding sphere for correct rendering
}

// loader.load("./drone.gltf", function(gltf) {
//     const drone = gltf.scene;

//     drone.scale.set(1, 1, 1); // Scale down if too large
//     drone.position.set(0, 0, 5); // Adjust start position

//     //const newMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 }); // Green color
//     // drone.traverse((child) => {
//     //     if (child.isMesh) {
//     //         child.material = new THREE.MeshStandardMaterial({ color: 0x00ff00 }); // 🟢 Green Color
//     //     }
//     // });
//     console.log("Drone Model Structure:", gltf.scene);
    


//     scene.add(drone);
//      window.drone = drone; // Replace drone box with 3D model
// }, undefined, function(error) {
//     console.error("Error loading model:", error);
// });




// Create drone model
// const geometry = new THREE.BoxGeometry(3, 1, 1);
// const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
// const drone = new THREE.Mesh(geometry, material);
// scene.add(drone);

//Add a Skybox (Basic Color for Now)
scene.background = new THREE.Color(0x87ceeb); // Sky blue

// Set initial camera position
camera.position.set(0, 0, 0);
// camera.lookAt(drone.position);

let propellerSpeed = 0; // Start with 0 speed

function updatePropellers() {
    if (propellerRotation) {
        propellerSpeed = Math.min(propellerSpeed + 0.05, 5); // Increase speed to max 1
    } else {
        propellerSpeed = Math.max(propellerSpeed - 0.05, 0); // Decrease speed to 0
    }
    propellers.forEach(propeller => {
        propeller.rotation.z += propellerSpeed * 0.2; // Adjust rotation speed
    });
}


// ✅ Function to start the drone sound
function startDroneSound() {
    if (!sound.isPlaying) {
        sound.play(); // Play sound only if it's not already playing
    }
}

// ✅ Function to stop the drone sound
function stopDroneSound() {
    if (sound.isPlaying) {
        sound.stop();
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    updatePropellers(); // ✅ Update propeller speed

    // Move the camera with the drone
    if (drone) {
        // 🚁 Keep camera behind and above the drone
        const offset = new THREE.Vector3(0, 1.7, 6); // Adjust distance & height
        const dronePosition = drone.position.clone();
        const targetPosition = dronePosition.add(offset);

        // 🏎️ Smooth transition for a realistic follow effect
        camera.position.lerp(targetPosition, 0.1); // Adjust smoothing (0.1 = slow, 1 = instant)
        camera.lookAt(drone.position);
    }
    if (drone) {
        let minVolume = 0.2; // Minimum volume when on the ground
        let maxVolume = 1.0; // Max volume at high altitude
        let volume = Math.min(maxVolume, minVolume + drone.position.y / 10);
        sound.setVolume(volume);
    }

    // camera.lookAt(drone.position);
    renderer.render(scene, camera);
}

animate();



function tiltDrone(direction) {
    if (!drone) return;

    let tiltAmount = 0.1; // Adjust tilt intensity

    let tiltMap = {
        B: { x: tiltAmount, y: 0, z: 0 },  // Forward tilt
        F: { x: -tiltAmount, y: 0, z: 0 }, // Backward tilt
        L: { x: 0, y: 0, z: tiltAmount },  // Left tilt
        R: { x: 0, y: 0, z: -tiltAmount }, // Right tilt
    };

    let tilt = tiltMap[direction] || { x: 0, y: 0, z: 0 };

    gsap.to(drone.rotation, { 
        x: tilt.x, 
        z: tilt.z, 
        duration: 0.3, 
        ease: "power2.out" 
    });

    // Restore the tilt after a short delay
    setTimeout(() => {
        gsap.to(drone.rotation, { 
            x: 0, 
            z: 0, 
            duration: 0.5, 
            ease: "power2.out" 
        });
    }, 500);
}


// Move drone smoothly
function moveDrone(axis, value, duration = 1000) {
  const targetPosition = drone.position.clone();
  targetPosition[axis] += value;
  gsap.to(drone.position, {
    [axis]: targetPosition[axis],
    duration: duration / 1000,
    ease: "power2.inOut",
  });
}

// Execute drone commands
function executeCommand(command) {
    console.log("Executing:", command);

    let parts = command.split(" ");
    let action = parts[0];


    if (action === "takeoff") {
        propellerRotation = true;
        startDroneSound();
        gsap.to(drone.position, { y: drone.position.y + 2, duration: 1, ease: "power2.inOut" });
    } else if (action === "land") {
        gsap.to(drone.position, { y: 0, duration: 1, ease: "power2.inOut",onUpdate: updateTrail, onComplete: () => {
            propellerRotation = false;
        stopDroneSound();

        }});
    } else if (action === "fly") {
        let directionMap = { F: "z", B: "z", L: "x", R: "x", U: "y", D: "y" };
        let axis = directionMap[parts[1]];
        let value = parseFloat(parts[2]);

        if (!axis) {
            console.error("Invalid direction:", parts[1]);
            return;
        }

        if (parts[1] === "F" || parts[1] === "D") {
            value = -value;
        }

        propellerRotation = true;
        startDroneSound();
        gsap.to(drone.position, { [axis]: drone.position[axis] + value, duration: 1, ease: "power2.inOut",onUpdate: updateTrail, });

        // Tilt the drone slightly while moving
        
        tiltDrone(parts[1]);
    }
    else if (action === "circle") {
      let direction = parts[1]; // "CL" or "CR"
      let radius = parseFloat(parts[2]); // Radius of the circle
      let steps = 36; // Number of steps (10° per step)
      let angleIncrement = (2 * Math.PI) / steps; // Convert degrees to radians

      // Reverse for clockwise rotation
      if (direction === "CR") {
          angleIncrement = -angleIncrement;
      }

      let currentStep = 0;
      let startX = drone.position.x;
      let startZ = drone.position.z;
      let startAngle = 0;

      propellerRotation = true;
      startDroneSound();

      function moveInCircle() {
          if (currentStep > steps) {
              // Complete circle, stop propellers
              propellerRotation = false;
              stopDroneSound();
              return;
          }

          // Calculate next position along the circle
          let angle = startAngle + currentStep * angleIncrement;
          let x = startX + radius * Math.cos(angle);
          let z = startZ + radius * Math.sin(angle);

          gsap.to(drone.position, {
              x: x,
              z: z,
              duration: 0.1,
              ease: "linear",
              onUpdate: updateTrail, // Update trail as it moves
              onComplete: moveInCircle,
          });

          currentStep++;
      }

      // Start the circular motion
      moveInCircle();
  }
    
}
// Initialize the trail once when setting up the scene
initTrail();

window.executeCommand = executeCommand;
