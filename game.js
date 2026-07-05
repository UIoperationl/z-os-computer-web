import * as THREE from 'three';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 10, 100);

// Camera setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
directionalLight.shadow.camera.left = -20;
directionalLight.shadow.camera.right = 20;
directionalLight.shadow.camera.top = 20;
directionalLight.shadow.camera.bottom = -20;
scene.add(directionalLight);

// Ground
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x7CFC00 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Player
const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x0066ff });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.position.y = 1;
player.castShadow = true;
scene.add(player);

// Player movement
const moveSpeed = 0.1;
const jumpSpeed = 0.2;
let velocity = new THREE.Vector3();
let isJumping = false;

// Input handling
const keys = {};
document.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
document.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

document.addEventListener('click', () => {
    if (!isJumping) {
        isJumping = true;
        velocity.y = jumpSpeed;
    }
});

// Mouse look
let mouseX = 0;
let mouseY = 0;
document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
});

// Game objects
const objects = [];
for (let i = 0; i < 20; i++) {
    const geometry = new THREE.BoxGeometry(
        Math.random() * 2 + 1,
        Math.random() * 2 + 1,
        Math.random() * 2 + 1
    );
    const material = new THREE.MeshStandardMaterial({ 
        color: new THREE.Color(Math.random(), Math.random(), Math.random())
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(
        (Math.random() - 0.5) * 50,
        geometry.parameters.height / 2,
        (Math.random() - 0.5) * 50
    );
    cube.castShadow = true;
    cube.receiveShadow = true;
    scene.add(cube);
    objects.push(cube);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Player movement
    if (keys['w']) velocity.z -= moveSpeed;
    if (keys['s']) velocity.z += moveSpeed;
    if (keys['a']) velocity.x -= moveSpeed;
    if (keys['d']) velocity.x += moveSpeed;
    
    // Apply gravity
    if (isJumping) {
        velocity.y -= 0.01;
        if (player.position.y <= 1) {
            player.position.y = 1;
            isJumping = false;
            velocity.y = 0;
        }
    }
    
    // Update player position
    player.position.add(velocity);
    velocity.x *= 0.9;
    velocity.z *= 0.9;
    
    // Camera follow
    camera.position.x = player.position.x + mouseX * 5;
    camera.position.y = player.position.y + 5 + mouseY * 2;
    camera.position.z = player.position.z + 10;
    camera.lookAt(player.position);
    
    // Rotate objects
    objects.forEach(obj => {
        obj.rotation.x += 0.01;
        obj.rotation.y += 0.01;
    });
    
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
