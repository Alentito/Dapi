// Initialize Three.js Scene
//import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true });
const container = document.getElementById("simulatorContainer");
const width = container.clientWidth;
const height = container.clientHeight;

renderer.setSize(width, height);
container.appendChild(renderer.domElement);

//Add Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;  // Smooth camera movement
controls.dampingFactor = 0.05;  // Damping speed
controls.screenSpacePanning = false;  // Prevent awkward panning
controls.maxPolarAngle = Math.PI / 2;  // Restrict camera movement below ground



// Add lighting
const light = new THREE.AmbientLight(0xffffff, 1);
scene.add(light);

//Create a Ground Plane
const groundGeometry = new THREE.PlaneGeometry(50, 50);
        const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2; // Make it flat
        scene.add(ground);

// Create drone model
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const drone = new THREE.Mesh(geometry, material);
scene.add(drone);


//Add a Skybox (Basic Color for Now)
scene.background = new THREE.Color(0x87CEEB); // Sky blue


// Set initial camera position
camera.position.set(0, 2, 5);
camera.lookAt(drone.position);

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update(); 
    renderer.render(scene, camera);
}
animate();

// Move drone smoothly
function moveDrone(axis, value, duration = 1000) {
    const targetPosition = drone.position.clone();
    targetPosition[axis] += value;
    gsap.to(drone.position, { [axis]: targetPosition[axis], duration: duration / 1000, ease: "power2.inOut" });
}

// Execute drone commands
function executeCommand(command) {
    console.log("Executing:", command);
    
    let parts = command.split(" ");
    let action = parts[0];

   
    if (action === "takeoff") {
        drone.position.y = 2; // Move up to simulate takeoff
    }
    else if (action === "land") {
        drone.position.y = 0; // Move down to land
    }
    else if (action === "fly") {
        let directionMap = {
            "F": "forward",
            "B": "backward",
            "L": "left",
            "R": "right",
            "U": "up",
            "D": "down"
        };

        let direction = directionMap[parts[1]];  // Convert "F" to "forward"
        let value = parseFloat(parts[2]);

        if (!direction) {
            console.error("Invalid direction:", parts[1]);
            return;
        }

        switch (direction) {
            case "forward": drone.position.z -= value; break;
            case "backward": drone.position.z += value; break;
            case "left": drone.position.x -= value; break;
            case "right": drone.position.x += value; break;
            case "up": drone.position.y += value; break;
            case "down": drone.position.y -= value; break;
        }
    }
    else if (action === "yaw") {
        let direction = parts[1]; // "left", "right"
        let degrees = parseFloat(parts[2]);

        let angle = THREE.MathUtils.degToRad(degrees);
        drone.rotation.y += direction === "left" ? angle : -angle;
    }
}
window.executeCommand = executeCommand;