import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

let scene, camera, renderer, player, flashlight, slenderman;

const clock = new THREE.Clock();
const trees = [];
const pages = [];

let velocity = new THREE.Vector3();

let movement = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

let gameState = {
    pagesCollected: 0,
    batteryLevel: 100,
    batteryDrainRate: 100 / 180,
    gameOver: false,
    gameWon: false,
    isPointerLocked: false
};

let instructions, crosshair, uiContainer, pageCountUI, batteryBar, winMessage, loseMessage;

export function init() {
    instructions = document.getElementById('instructions');
    crosshair = document.getElementById('crosshair');
    uiContainer = document.getElementById('ui-container');
    pageCountUI = document.getElementById('page-count');
    batteryBar = document.getElementById('battery-bar');
    winMessage = document.getElementById('win-message');
    loseMessage = document.getElementById('lose-message');

    initGame();
    animate();
}

function initGame() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 1, 60);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    player = new THREE.Group();
    player.add(camera);
    player.position.set(0, 1.7, 5);
    scene.add(player);

    const ambientLight = new THREE.AmbientLight(0x101010);
    scene.add(ambientLight);

    const flashlight = new THREE.SpotLight(0xffffff, 20, 100, Math.PI / 4, 0.4, 1);
    flashlight.position.set(0, 0, 0);

    flashlight.target.position.set(0, 0, -1);

    camera.add(flashlight);
    camera.add(flashlight.target);

    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    createGrass();
    createTrees();
    createPages();
    createSlenderman();

    instructions.addEventListener('click', startGame);
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);
}


let treeModel = null;

function loadTreeModel(callback) {
    if (treeModel) {
        callback(treeModel.clone());
        return;
    }

    const treePath = "/assets/GreenPine";

    const texture = new THREE.TextureLoader().load(
        treePath + "/Branches0018_1_S.png"
    );

    const objLoader = new OBJLoader();
    objLoader.load(treePath + "/Tree2.obj", (tree) => {

        tree.traverse((child) => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                    map: texture,
                    alphaTest: 0.3,
                    side: THREE.DoubleSide
                });
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        tree.scale.set(1, 1, 1);

        treeModel = tree;
        callback(tree.clone());
    });
}

function createGrass() {
    const grassTexture = new THREE.TextureLoader().load(
    "/assets/Ground/grass.jpg"
    );

    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(40, 40);

    const groundMaterial = new THREE.MeshStandardMaterial({
        map: grassTexture,
        roughness: 1,
        metalness: 0
    });

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 400),
        groundMaterial
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;

    scene.add(ground);

}


function createTrees() {
    for (let i = 0; i < 300; i++) {

        loadTreeModel((tree) => {

            let x, z;
            do {
                x = (Math.random() - 0.5) * 190;
                z = (Math.random() - 0.5) * 190;
            } while (Math.abs(x) < 10 && Math.abs(z) < 10);

            tree.position.set(x, -1.2, z);

            scene.add(tree);

            trees.push({ position: tree.position, radius: 2 });
        });
    }
}

function createPages() {
    const pageGeo = new THREE.PlaneGeometry(0.4, 0.6);
    const pageMat = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        side: THREE.DoubleSide,
        emissive: 0xaaaaaa,
        emissiveIntensity: 0.1
    });

    const page1 = new THREE.Mesh(pageGeo, pageMat);
    page1.position.set(30, 1.5, 40);
    page1.name = "page";
    scene.add(page1);
    pages.push(page1);

    const page2 = new THREE.Mesh(pageGeo, pageMat);
    page2.position.set(-40, 1.5, -35);
    page2.name = "page";
    scene.add(page2);
    pages.push(page2);
}

function createSlenderman() {
    const basePath = "/assets/Slenderman";

    const texture = new THREE.TextureLoader().load(
        basePath + "/Textures/Tex_0666_0.PNG"
    );

    const objLoader = new OBJLoader();
        objLoader.load(
            basePath + "/3DS Max/Slenderman Model.obj",
            function (slender) {

                slender.traverse(function (child) {
                    if (child.isMesh) {
                        child.material = new THREE.MeshStandardMaterial({
                            map: texture
                        });
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                slender.scale.set(0.008, 0.008, 0.008 );
                slender.position.set(0, 2.68, 0);

                scene.add(slender);
            }
        );

}


function startGame() {
    document.body.requestPointerLock();

    document.addEventListener("pointerlockchange", () => {
        if (document.pointerLockElement === renderer.domElement) {
            renderer.domElement.focus();
        }
    });

    document.addEventListener("mousemove", (e) => {
        if (document.pointerLockElement) {
            e.preventDefault();
        }
    }, { passive: false });

    renderer.domElement.addEventListener("wheel", (e) => {
        e.preventDefault();
    }, { passive: false });

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

}

function onPointerLockChange() {
    if (document.pointerLockElement === document.body) {
        gameState.isPointerLocked = true;
        instructions.style.display = 'none';
        crosshair.style.display = 'block';
        uiContainer.style.display = 'block';
    } else {
        if (!gameState.gameOver && !gameState.gameWon) {
            gameState.isPointerLocked = false;
            instructions.style.display = 'flex';
            crosshair.style.display = 'none';
            uiContainer.style.display = 'none';
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': movement.forward = true; break;
        case 'KeyS': movement.backward = true; break;
        case 'KeyA': movement.left = true; break;
        case 'KeyD': movement.right = true; break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': movement.forward = false; break;
        case 'KeyS': movement.backward = false; break;
        case 'KeyA': movement.left = false; break;
        case 'KeyD': movement.right = false; break;
    }
}

function onMouseMove(event) {
    if (!gameState.isPointerLocked) return;
    const moveX = event.movementX || 0;
    const moveY = event.movementY || 0;
    player.rotation.y -= moveX * 0.002;
    camera.rotation.x -= moveY * 0.002;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x, -Math.PI / 2, Math.PI / 2);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (gameState.isPointerLocked && !gameState.gameOver && !gameState.gameWon) {
        handleMovement(delta);
        updateBattery(delta);
        checkInteractions();
        updateSlenderman(delta);

    }

    renderer.render(scene, camera);
}


function handleMovement(delta) {
    const moveSpeed = 5.0 * delta; 
    velocity.set(0, 0, 0);

    if (movement.forward) velocity.z -= moveSpeed;
    if (movement.backward) velocity.z += moveSpeed;
    if (movement.left) velocity.x -= moveSpeed;
    if (movement.right) velocity.x += moveSpeed;

    player.translateX(velocity.x);
    player.translateZ(velocity.z);

    const playerPos = player.position;
    for (const tree of trees) {
        const dx = playerPos.x - tree.position.x;
        const dz = playerPos.z - tree.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < tree.radius) {
            const overlap = tree.radius - dist;
            const pushX = (dx / dist) * overlap;
            const pushZ = (dz / dist) * overlap;
            player.position.x += pushX;
            player.position.z += pushZ;
        }
    }

    player.position.x = THREE.MathUtils.clamp(player.position.x, -98, 98);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -98, 98);
}

function updateBattery(delta) {
    gameState.batteryLevel -= gameState.batteryDrainRate * delta;
    gameState.batteryLevel = Math.max(0, gameState.batteryLevel); 

    batteryBar.style.width = gameState.batteryLevel + '%';

    if (gameState.batteryLevel < 30) {
        batteryBar.style.backgroundColor = '#f44336';
    } else if (gameState.batteryLevel < 60) {
        batteryBar.style.backgroundColor = '#ffeb3b';
    }

    if (gameState.batteryLevel <= 0) {
        handleGameOver(false);
    }
}

function checkInteractions() {
    // Coletar páginas
    for (let i = pages.length - 1; i >= 0; i--) {
        const page = pages[i];
        const dist = player.position.distanceTo(page.position);

        if (dist < 1.5) {
            scene.remove(page);
            pages.splice(i, 1);
            gameState.pagesCollected++;

            pageCountUI.textContent = `Páginas: ${gameState.pagesCollected} / 2`;
            
            if (gameState.pagesCollected >= 2) {
                handleGameWin();
            }
        }
    }
}

function updateSlenderman(delta) {
    if (!slenderman) return;

    const dist = player.position.distanceTo(slenderman.position);
    if (dist < 2.0) {
        handleGameOver(true);
        return;
    }

    let speed = 0.5;
    speed += gameState.pagesCollected * 0.4;
    
    slenderman.lookAt(player.position.x, slenderman.position.y, player.position.z);
    
    slenderman.translateZ(speed * delta);
}

function handleGameOver(wasCaught) {
    if (gameState.gameOver) return;
    
    gameState.gameOver = true;
    document.exitPointerLock();
    crosshair.style.display = 'none';
    uiContainer.style.display = 'none';

    if (wasCaught) {
        loseMessage.innerHTML = '<h2>VOCÊ FOI PEGO!</h2><p>A criatura te alcançou na escuridão.</p>';
    } else {
        loseMessage.innerHTML = '<h2>FIM DE JOGO</h2><p>A bateria acabou... A escuridão te consumiu.</p>';
    }
    loseMessage.style.display = 'block';
}

function handleGameWin() {
    if (gameState.gameWon) return;

    gameState.gameWon = true;
    document.exitPointerLock();
    crosshair.style.display = 'none';
    uiContainer.style.display = 'none';
    winMessage.style.display = 'block';
}