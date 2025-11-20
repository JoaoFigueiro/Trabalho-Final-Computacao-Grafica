import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

let scene, camera, renderer, player, flashlight, slenderman;
let loadingManager;
let loadingScreen, loadingBar, loadingText;

let minimapContainer, playerMarker, houseMarker, fireMarker;
let isMapVisible = true;

const mapScale = 0.8;
const mapSize = 200;

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
    batteryDrainRate: 100 / 300,
    gameOver: false,
    gameWon: false,
    isPointerLocked: false,
    flashlightOn: true
};

let slenderLogic = {
    lastTeleport: 0,
    teleportInterval: 8, // Segundos para ele tentar mudar de lugar
    minDistance: 10,     // Distância mínima ao teleportar
    maxDistance: 25,     // Distância máxima ao teleportar
    aggressiveness: 0,   // Aumenta conforme pega páginas
    scareCooldown: 0     // Evita game over instantâneo ao spawnar
};

let instructions, crosshair, uiContainer, pageCountUI, batteryBar, winMessage, loseMessage;
let staticElement;
let listener;
let soundStatic, soundFootsteps, soundJumpscare, soundWin; // Variáveis de som
let stepTimer = 0;
const stepInterval = 0.6;
let bobTimer = 0;
const bobFrequency = 10; // Velocidade da oscilação
const bobAmplitude = 0.1; // Altura da oscilação (o quão "bumpy" é a caminhada)
const defaultCameraY = 1.7; // Altura padrão dos olhos
let campfireLight; // Variável global para animar a luz depois
// Variáveis para o sistema de partículas de fogo
const fireParticles = []; 
let fireTextureRef = null; // Para guardar a textura e usar nas partículas
let housePos = new THREE.Vector3(0, -1000, 0); // Começa longe só por segurança
let soundFlashlight; // Nova variável para o som do click
let interactMessage;
let campfirePos = new THREE.Vector3(); // Variável para guardar onde a fogueira nasceu
let soundAmbience;

export function init() {
    instructions = document.getElementById('instructions');
    // Começa escondido para não clicarem antes de carregar
    instructions.style.display = 'none';

    crosshair = document.getElementById('crosshair');
    uiContainer = document.getElementById('ui-container');
    pageCountUI = document.getElementById('page-count');
    batteryBar = document.getElementById('battery-bar');
    winMessage = document.getElementById('win-message');
    loseMessage = document.getElementById('lose-message');

    initStaticEffect();
    initInteractUI();
    initMinimap(); // Se você implementou o minimapa

    // --- NOVO CÓDIGO DE LOADING ---
    initLoadingUI();

    loadingManager = new THREE.LoadingManager();

    // Ocorre a cada item carregado
    loadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
        const progress = (itemsLoaded / itemsTotal) * 100;
        loadingBar.style.width = progress + '%';
        loadingText.innerText = `Carregando Pesadelos... ${Math.round(progress)}%`;
    };

    // Ocorre quando TUDO termina
    loadingManager.onLoad = function () {
        // Some com a tela de loading
        loadingScreen.style.display = 'none';
        // Mostra o "Clique para Jogar"
        instructions.style.display = 'flex';
    };
    // -----------------------------

    initGame();
    animate();
}

function initInteractUI() {
    interactMessage = document.createElement('div');
    interactMessage.style.position = 'absolute';
    interactMessage.style.top = '60%';
    interactMessage.style.left = '50%';
    interactMessage.style.transform = 'translate(-50%, -50%)';
    interactMessage.style.color = '#ffffff';
    interactMessage.style.fontFamily = 'Arial, sans-serif';
    interactMessage.style.fontSize = '20px';
    interactMessage.style.textShadow = '0px 0px 5px #000';
    interactMessage.style.display = 'none'; // Começa escondido
    interactMessage.innerHTML = "Pressione <b>[E]</b> para QUEIMAR as páginas";    
    document.body.appendChild(interactMessage);
}

function initStaticEffect() {
    // Cria a div da estática
    staticElement = document.createElement('div');
    staticElement.id = 'static-overlay';
    
    // Estilização via JS para garantir que funcione direto
    Object.assign(staticElement.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none', // Permite clicar através dela
        zIndex: '10',
        opacity: '0',
        backgroundImage: 'url("https://media.giphy.com/media/oEI9uBYSzLpBK/giphy.gif")', // Um GIF de ruído clássico
        backgroundSize: 'cover',
        mixBlendMode: 'overlay' // Faz o ruído mesclar com o jogo
    });

    document.body.appendChild(staticElement);
}

function updateFireParticles(delta) {
    fireParticles.forEach(p => {
        // Sobe a partícula
        p.position.y += delta * p.userData.speed;
        
        // Diminui a opacidade (fade out)
        p.material.opacity -= delta * 0.8;
        
        // --- CORREÇÃO AQUI ---
        // Antes estava: p.rotation += ... (ERRADO)
        // Agora: p.material.rotation (Gira a textura da imagem 2D)
        p.material.rotation += delta * p.userData.rotationSpeed; 

        // Se ficar invisível ou subir demais, reseta para a base
        if (p.material.opacity <= 0) {
            p.position.y = -1.0; 
            p.position.x = p.userData.originX + (Math.random() - 0.5) * 0.5; 
            p.position.z = p.userData.originZ + (Math.random() - 0.5) * 0.5;
            p.material.opacity = 1;
            
            const scale = 1 + Math.random() * 1.5; 
            p.scale.set(scale, scale, scale);
        }
    });
}

function initAudio() {
    // Cria o "ouvido" da câmera
    listener = new THREE.AudioListener();
    camera.add(listener);

    const audioLoader = new THREE.AudioLoader(loadingManager);

    // 1. Som de Estática (Loop)
    soundStatic = new THREE.Audio(listener);
    audioLoader.load('/assets/Sounds/static.mp3', function(buffer) {
        soundStatic.setBuffer(buffer);
        soundStatic.setLoop(true);
        soundStatic.setVolume(0); // Começa mudo
        soundStatic.play(); // Toca em loop, mas com volume 0
    });

    // 2. Som de Passos
    soundFootsteps = new THREE.Audio(listener);
    audioLoader.load('/assets/Sounds/step_grass.mp3', function(buffer) {
        soundFootsteps.setBuffer(buffer);
        soundFootsteps.setLoop(false);
        soundFootsteps.setVolume(0.3); // Volume dos passos
        // Pequena variação de detune para não soar robótico
        soundFootsteps.detune = (Math.random() - 0.5) * 100; 
    });

    // 3. Som de Jumpscare
    soundJumpscare = new THREE.Audio(listener);
    audioLoader.load('/assets/Sounds/jumpscare.mp3', function(buffer) {
        soundJumpscare.setBuffer(buffer);
        soundJumpscare.setLoop(false);
        soundJumpscare.setVolume(1.0); // Volume máximo
    });

    // NOVO: Som de Click da Lanterna
    soundFlashlight = new THREE.Audio(listener);
    audioLoader.load('/assets/Sounds/click.mp3', function(buffer) {
        soundFlashlight.setBuffer(buffer);
        soundFlashlight.setLoop(false);
        soundFlashlight.setVolume(0.5);
    });

    soundAmbience = new THREE.Audio(listener);
    audioLoader.load('/assets/Sounds/ambience.mp3', function(buffer) {
        soundAmbience.setBuffer(buffer);
        soundAmbience.setLoop(true); // Toca para sempre
        soundAmbience.setVolume(0.5); // Volume médio (não cubra os passos!)
        soundAmbience.play();
    });
}

function initGame() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.Fog(0x050510, 10, 45);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    initAudio();

    player = new THREE.Group();
    player.add(camera);
    player.position.set(0, 1.7, 5);
    scene.add(player);

    const ambientLight = new THREE.AmbientLight(0x151535, 1.5);
    scene.add(ambientLight);

    // CORRETO (Remova o 'const' para usar a variável global):
    flashlight = new THREE.SpotLight(0xffffff, 20, 100, Math.PI / 4, 0.4, 1);
    
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
    createHouse();
    createTrees();
    createCampfire();
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
    const textureLoader = new THREE.TextureLoader(loadingManager);

    // 1. Carregar texturas
    const barkTexture = textureLoader.load(treePath + "/bark_0004.jpg");
    const leafTexture = textureLoader.load(treePath + "/DB2X2_L01.png");

    barkTexture.colorSpace = THREE.SRGBColorSpace;
    leafTexture.colorSpace = THREE.SRGBColorSpace;

    // --- CORREÇÃO DO TRONCO ESTICADO ---
    // Isso diz pro Three.js: "Não estique a imagem, repita ela como um azulejo"
    barkTexture.wrapS = THREE.RepeatWrapping; // Repetir na horizontal
    barkTexture.wrapT = THREE.RepeatWrapping; // Repetir na vertical
    
    // Ajuste estes números! (Horizontal, Vertical)
    // Tente (1, 4) ou (1, 8) dependendo da altura da árvore.
    // Quanto maior o segundo número, mais vezes a textura se repete verticalmente.
    barkTexture.repeat.set(1, 6); 
    // ------------------------------------

    const objLoader = new OBJLoader(loadingManager);
    objLoader.load(treePath + "/Tree.obj", (tree) => {

        tree.traverse((child) => {
            if (child.isMesh) {
                const meshName = child.name.toLowerCase();
                const matName = child.material.name ? child.material.name.toLowerCase() : "";

                // Verifica se é tronco
                if (meshName.includes("bark") || meshName.includes("trunk") || meshName.includes("stem") || matName.includes("bark")) {
                    
                    child.material = new THREE.MeshStandardMaterial({
                        map: barkTexture,
                        roughness: 0.9,
                        metalness: 0.0,
                        side: THREE.DoubleSide
                    });

                } else {
                    // Folhas
                    child.material = new THREE.MeshStandardMaterial({
                        map: leafTexture,
                        alphaTest: 0.4,
                        side: THREE.DoubleSide,
                        roughness: 0.8,
                        metalness: 0.0
                    });
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            }
        });

        const TREE_SCALE = 3.5; 
        tree.scale.set(TREE_SCALE, TREE_SCALE, TREE_SCALE);

        treeModel = tree;
        callback(tree.clone());
    });
}

function createHouse() {
    const path = "/assets/House"; 
    
    // --- PASSO 1: SORTEAR POSIÇÃO (Síncrono) ---
    // Fazemos isso ANTES de carregar o modelo, para as árvores saberem onde não nascer
    let x, z;
    let distToSpawn;

    do {
        // Sorteia entre -90 e 90 (para ficar dentro do mapa jogável)
        x = (Math.random() - 0.5) * 180; 
        z = (Math.random() - 0.5) * 180;
        
        // Calcula distância do jogador (0,0)
        distToSpawn = Math.sqrt(x*x + z*z);

    // Repete o sorteio se cair muito perto do jogador (menos de 30 metros)
    } while (distToSpawn < 30);

    // Atualiza a variável global IMEDIATAMENTE
    housePos.set(x, -1.2, z);
    console.log("Local da casa definido em:", x, z);

    // Adiciona a colisão da casa na lista de "obstáculos" AGORA.
    // Isso garante que createTrees() respeite a casa, mesmo se o modelo 3D demorar pra baixar.
    // O raio de 8 evita que o jogador entre na parede.
    trees.push({ position: housePos, radius: 12.5 }); 
    
    console.log("Casa (com colisão reforçada) criada em:", housePos.x, housePos.z);

    // --- PASSO 2: CARREGAR O VISUAL ---
    const textureLoader = new THREE.TextureLoader(loadingManager);
    const diffuseMap = textureLoader.load(path + "/cottage_diffuse.png");
    diffuseMap.colorSpace = THREE.SRGBColorSpace;

    const objLoader = new OBJLoader(loadingManager);
    objLoader.load(path + "/cottage_obj.obj", (house) => {
        
        house.traverse((child) => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                    map: diffuseMap,
                    roughness: 0.8,
                    metalness: 0.1,
                    side: THREE.DoubleSide
                });
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Usa a posição que sorteamos lá em cima
        house.position.copy(housePos);
        
        const scale = 0.7; 
        house.scale.set(scale, scale, scale);
        
        // DICA: Gire a casa aleatoriamente também, para a porta não ficar sempre pro mesmo lado
        house.rotation.y = Math.random() * Math.PI * 2;

        scene.add(house);
        
        // (Opcional) Adicionar uma luz fraca na varanda da casa para ajudar a achar
        const houseLight = new THREE.PointLight(0xffaa55, 20, 10);
        houseLight.position.set(x, 2, z); // 2 metros de altura
        scene.add(houseLight);
    });
}


function createCampfire() {
    const campfirePath = "/assets/Campfire"; 
    const textureLoader = new THREE.TextureLoader(loadingManager);
    
    // Carrega texturas
    const woodTexture = textureLoader.load(campfirePath + "/Campfire_MAT_BaseColor_00.jpg");
    const fireTexture = textureLoader.load(campfirePath + "/Campfire_fire_MAT_BaseColor_Alpha.png");
    
    // Salva referencia para usar nas partículas
    fireTextureRef = fireTexture;

    woodTexture.colorSpace = THREE.SRGBColorSpace;
    fireTexture.colorSpace = THREE.SRGBColorSpace;

    const objLoader = new OBJLoader(loadingManager);
    
    // Carrega o modelo da madeira
    objLoader.load(campfirePath + "/Campfire_clean.OBJ", (campfire) => {

        campfire.traverse((child) => {
            if (child.isMesh) {
                const name = child.name.toLowerCase();
                const matName = child.material.name ? child.material.name.toLowerCase() : "";
                
                // Verifica se é a parte do FOGO original (geometria fixa)
                const isFire = (name.includes("fire") || name.includes("flame") || matName.includes("fire")) 
                               && !name.includes("campfire");

                if (isFire) {
                    // Deixamos o fogo original como um "núcleo" brilhante
                    child.material = new THREE.MeshBasicMaterial({ 
                        map: fireTexture,
                        transparent: true,
                        opacity: 0.6, // Um pouco mais fraco pra não brigar com as partículas
                        side: THREE.DoubleSide,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                        color: 0xffaa44
                    });
                    child.visible = true; // Garante que aparece
                } else {
                    // MADEIRA
                    child.material = new THREE.MeshStandardMaterial({
                        map: woodTexture,
                        roughness: 1,
                        emissive: 0x332211,
                        emissiveIntensity: 0.2,
                        color: 0xffffff
                    });
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            }
        });

        // Lógica de Posicionamento
        let x, z;
        let validPosition = false;
        let attempts = 0;

        while (!validPosition && attempts < 100) {
            attempts++;
            x = (Math.random() - 0.5) * 180; 
            z = (Math.random() - 0.5) * 180;
            validPosition = true;
            for (const tree of trees) {
                if (Math.sqrt((x - tree.position.x)**2 + (z - tree.position.z)**2) < 5.0) { 
                    validPosition = false; break; 
                }
            }
        }

        if (validPosition) {
            // Posiciona a fogueira
            campfire.position.set(x, -1.2, z); 
            campfirePos.set(x, -1.2, z);
            const scale = 0.05; 
            campfire.scale.set(scale, scale, scale); 
            scene.add(campfire);

            // Luz
            campfireLight = new THREE.PointLight(0xff5500, 50, 25); 
            campfireLight.position.set(x, 1.5, z); 
            campfireLight.castShadow = true;
            campfireLight.shadow.bias = -0.0001;
            scene.add(campfireLight);
            
            // --- AQUI ESTÁ A MÁGICA: CRIAR AS PARTÍCULAS ---
            // Cria 25 sprites de fogo que vão subir
            for (let i = 0; i < 25; i++) {
                const material = new THREE.SpriteMaterial({
                    map: fireTextureRef,
                    color: 0xffaa44,
                    blending: THREE.AdditiveBlending, // Brilha intenso
                    transparent: true,
                    opacity: Math.random() // Começa com opacidade variada
                });

                const sprite = new THREE.Sprite(material);
                
                // Posiciona na base da fogueira, espalhando um pouquinho
                sprite.position.set(
                    x + (Math.random() - 0.5) * 0.5, 
                    -1.0 + Math.random() * 0.5, 
                    z + (Math.random() - 0.5) * 0.5
                );

                // Escala aleatória
                const s = 1.5 + Math.random(); 
                sprite.scale.set(s, s, s);

                // Dados para a animação
                sprite.userData = {
                    originX: x,
                    originZ: z,
                    speed: 1.0 + Math.random() * 1.5, // Velocidade de subida
                    rotationSpeed: (Math.random() - 0.5) * 2 // Rotação
                };

                scene.add(sprite);
                fireParticles.push(sprite);
            }
            // -----------------------------------------------

            console.log("Fogueira com partículas criada em:", x, z);
        }
    });
}

function createGrass() {
    const grassTexture = new THREE.TextureLoader(loadingManager).load(
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
    let pagesCreated = 0;
    const maxPages = 3; // Total de páginas no jogo
    
    // Geometria da página (reutilizada para não pesar a memória)
    const pageGeo = new THREE.PlaneGeometry(0.4, 0.6);
    const pageMat = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        side: THREE.DoubleSide,
        emissive: 0xaaaaaa,
        emissiveIntensity: 0.1
    });

    for (let i = 0; i < 300; i++) {
        loadTreeModel((tree) => {
            // Posicionamento da árvore
            let x, z;
            do {
                x = (Math.random() - 0.5) * 190;
                z = (Math.random() - 0.5) * 190;
            } while (Math.abs(x) < 10 && Math.abs(z) < 10); // Não spawna no início

            tree.position.set(x, -1.2, z);
            
            // Rotação aleatória da árvore para variedade
            tree.rotation.y = Math.random() * Math.PI * 2;

            scene.add(tree);
            trees.push({ position: tree.position, radius: 1.5 }); // Reduzi raio para 1.5 para ajustar colisão

            // --- LÓGICA DE COLOCAR PÁGINA NA ÁRVORE ---
            // Se ainda precisamos de páginas, e a sorte permitir (ou se estivermos nas últimas árvores e faltar página)
            const shouldAddPage = (pagesCreated < maxPages) && (Math.random() < 0.05 || i > 250);

            if (shouldAddPage) {
                const page = new THREE.Mesh(pageGeo, pageMat);
                
                // Calcular posição no tronco
                // O tronco tem raio aprox de 0.5 a 0.8 na escala 1
                const trunkRadius = 0.6; 
                
                // Escolhe um ângulo aleatório ao redor do tronco
                const angle = Math.random() * Math.PI * 2;
                
                // Matemática: Posição da Árvore + (Seno/Cosseno * Raio)
                const pageX = tree.position.x + Math.sin(angle) * trunkRadius;
                const pageZ = tree.position.z + Math.cos(angle) * trunkRadius;
                
                page.position.set(pageX, 1.5, pageZ); // 1.5 é altura dos olhos aprox
                
                // Faz a página olhar para o centro da árvore
                page.lookAt(tree.position.x, 1.5, tree.position.z);
                
                // Gira 180 graus (PI) para o "frente" da página virar para fora, senão ela fica dentro do tronco
                page.rotation.y += Math.PI;
                
                // Adiciona leve rotação Z para parecer pregada torta
                page.rotation.z = (Math.random() - 0.5) * 0.5;

                page.name = "page";
                scene.add(page);
                pages.push(page);
                
                pagesCreated++;
                
                // Atualiza UI inicial
                pageCountUI.textContent = `Páginas: 0 / ${maxPages}`;
            }
        });
    }
}


function createSlenderman() {
    const basePath = "/assets/Slenderman";
    const texture = new THREE.TextureLoader(loadingManager).load(basePath + "/Textures/Tex_0666_0.PNG");
    const objLoader = new OBJLoader(loadingManager);

    objLoader.load(basePath + "/3DS Max/Slenderman Model.obj", function (slender) {
        slender.traverse(function (child) {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({ map: texture });
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        slender.scale.set(0.008, 0.008, 0.008);
        
        // Posição inicial longe para não assustar de cara
        slender.position.set(0, -10, 0); 
        
        scene.add(slender);
        
        // IMPORTANTE: Atribuir à variável global
        slenderman = slender; 
    });
}


function startGame() {
    document.body.requestPointerLock();

    document.addEventListener("pointerlockchange", () => {
        if (document.pointerLockElement === renderer.domElement) {
            renderer.domElement.focus();
        }
    });

    if (listener.context.state === 'suspended') {
        listener.context.resume();
    }

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

        case 'KeyM':
            isMapVisible = !isMapVisible;
            minimapContainer.style.display = isMapVisible ? 'block' : 'none';
            break;

        case 'KeyF':
            // Só funciona se o jogo estiver rodando e tiver bateria
            if (!gameState.gameOver && !gameState.gameWon && gameState.batteryLevel > 0) {
                
                // 1. Toca o som
                if (soundFlashlight) {
                    if (soundFlashlight.isPlaying) soundFlashlight.stop();
                    soundFlashlight.play();
                }

                // 2. Inverte o estado (Liga/Desliga)
                gameState.flashlightOn = !gameState.flashlightOn;

                // 3. Atualiza a intensidade da luz
                // Se ligado: intensidade 20. Se desligado: 0.
                flashlight.intensity = gameState.flashlightOn ? 20 : 0;
            }
            break;

        case 'KeyE':
            // Só funciona se tiver as 3 páginas
            if (gameState.pagesCollected >= 3) {
                const distToFire = player.position.distanceTo(campfirePos);
                
                // Se estiver perto do fogo
                if (distToFire < 6.0) {
                    // Opcional: Tocar um som de fogo alto ou grito do monstro morrendo aqui
                    
                    handleGameWin(); 
                }
            }
            break;
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
    const time = clock.getElapsedTime();

    if (gameState.isPointerLocked && !gameState.gameOver && !gameState.gameWon) {
        handleMovement(delta);
        updateBattery(delta);
        checkInteractions();
        updateSlenderman(delta, time);
        
        // Atualiza as partículas do fogo
        updateFireParticles(delta); // <--- ADICIONE ISSO
        updateMinimap();

        // Efeito de luz tremeluzindo (mantive o anterior)
        if (campfireLight) {
            campfireLight.intensity = 40 + Math.sin(time * 10) * 10 + Math.random() * 5;
            campfireLight.position.y = 1.0 + Math.sin(time * 20) * 0.1;
        }
    }
    renderer.render(scene, camera);
}


function handleMovement(delta) {
    const moveSpeed = 2.8 * delta; // Velocidade de caminhada
    velocity.set(0, 0, 0);
    let isMoving = false;

    // Movimentação WASD
    if (movement.forward) { velocity.z -= moveSpeed; isMoving = true; }
    if (movement.backward) { velocity.z += moveSpeed; isMoving = true; }
    if (movement.left) { velocity.x -= moveSpeed; isMoving = true; }
    if (movement.right) { velocity.x += moveSpeed; isMoving = true; }

    player.translateX(velocity.x);
    player.translateZ(velocity.z);

    // --- LÓGICA DO HEAD BOBBING (LANTERNA BALANÇANDO) ---
    if (isMoving && !gameState.gameOver) {
        // Aumenta o timer baseado no tempo
        bobTimer += delta * bobFrequency;
        
        // Cria a onda senoidal para Y (sobe e desce)
        player.position.y = defaultCameraY + Math.sin(bobTimer) * bobAmplitude;
        
        // Cria uma onda cossenoide suave para X (balanço lateral leve)
        player.rotation.z = Math.cos(bobTimer * 0.5) * 0.002; 
        
        // Lógica de Som de Passos (do passo anterior)
        stepTimer += delta;
        if (stepTimer > stepInterval) {
            if (soundFootsteps.isPlaying) soundFootsteps.stop();
            soundFootsteps.setDetune((Math.random() - 0.5) * 200);
            soundFootsteps.play();
            stepTimer = 0;
        }
    } else {
        // Se parar, reseta suavemente a altura para o padrão
        player.position.y = THREE.MathUtils.lerp(player.position.y, defaultCameraY, delta * 5);
        player.rotation.z = THREE.MathUtils.lerp(player.rotation.z, 0, delta * 5);
        // Reseta timer para o próximo passo começar do zero (opcional)
        bobTimer = 0; 
        stepTimer = stepInterval;
    }
    // -----------------------------------------------------

    // Colisão com árvores
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

    // Limites do mapa
    player.position.x = THREE.MathUtils.clamp(player.position.x, -98, 98);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -98, 98);
}

function updateBattery(delta) {
    // Se a lanterna estiver desligada OU o jogo acabou, não gasta bateria
    if (!gameState.flashlightOn || gameState.gameOver || gameState.gameWon) return;

    gameState.batteryLevel -= gameState.batteryDrainRate * delta;
    gameState.batteryLevel = Math.max(0, gameState.batteryLevel); 

    batteryBar.style.width = gameState.batteryLevel + '%';

    // Cores da bateria
    if (gameState.batteryLevel < 30) {
        batteryBar.style.backgroundColor = '#f44336'; // Vermelho
    } else if (gameState.batteryLevel < 60) {
        batteryBar.style.backgroundColor = '#ffeb3b'; // Amarelo
    }

    // Se a bateria acabar, desliga a luz e dá Game Over
    if (gameState.batteryLevel <= 0) {
        flashlight.intensity = 0; // Apaga a luz forçado
        gameState.flashlightOn = false;
        handleGameOver(false); // False = morreu por falta de bateria
    }
}

function checkInteractions() {
    // 1. Coleta de Páginas (Código padrão)
    for (let i = pages.length - 1; i >= 0; i--) {
        const page = pages[i];
        const dist = player.position.distanceTo(page.position);

        if (dist < 2.5) { // Distância de coleta
            scene.remove(page);
            pages.splice(i, 1);
            gameState.pagesCollected++;

            // Feedback visual
            if (gameState.pagesCollected < 3) {
                pageCountUI.textContent = `Páginas: ${gameState.pagesCollected} / 3`;
            } else {
                pageCountUI.textContent = "QUEIME AS PÁGINAS! Encontre a fogueira!";
                pageCountUI.style.color = "#ff5500"; // Laranja fogo
                pageCountUI.style.fontSize = "24px";
                pageCountUI.style.textShadow = "0px 0px 10px #ff0000";
            }
        }
    }

    // 2. Lógica da Casa (NOVO)
    if (gameState.pagesCollected >= 3) {
        // Checa distância da FOGUEIRA agora
        const distToFire = player.position.distanceTo(campfirePos);

        // Raio de 6 metros (perto o suficiente para sentir o calor)
        if (distToFire < 6.0) {
            interactMessage.style.display = 'block';
        } else {
            interactMessage.style.display = 'none';
        }
    }
}

function updateSlenderman(delta, time) {
    if (!slenderman) return;

    slenderLogic.lastTeleport += delta;

    // 1. Cálculos de Posição e Direção
    const playerDirection = new THREE.Vector3();
    camera.getWorldDirection(playerDirection); // Para onde o jogador olha

    const toSlender = slenderman.position.clone().sub(player.position).normalize();
    const distance = player.position.distanceTo(slenderman.position);
    
    // Produto Escalar: 1.0 = olhando direto, 0 = lado, -1 = costas
    const isLookingAt = playerDirection.dot(toSlender); 

    // O Slenderman sempre encara o jogador
    slenderman.lookAt(player.position.x, slenderman.position.y, player.position.z);

    // --- 2. LÓGICA DA ESTÁTICA (VISUAL E SONORA) ---
    let staticIntensity = 0;

    // Fator A: Proximidade (Quanto mais perto, mais estática)
    if (distance < 20) {
        staticIntensity += (20 - distance) / 20; // 0 a 1
    }

    // Fator B: Olhar direto (Se olhar pra ele, a estática dispara)
    if (distance < 30 && isLookingAt > 0.5) {
        staticIntensity += (isLookingAt - 0.5) * 2; 
    }

    // Tremulação aleatória
    if (staticIntensity > 0) {
        staticIntensity += (Math.random() - 0.5) * 0.2;
    }

    const finalIntensity = THREE.MathUtils.clamp(staticIntensity, 0, 0.8);

    // Aplica no visual (CSS)
    if (staticElement) {
        staticElement.style.opacity = finalIntensity;
    }

    // Aplica no áudio (Volume)
    if (soundStatic && soundStatic.buffer) {
        soundStatic.setVolume(finalIntensity * 0.5);
    }

    // --- 3. VERIFICA GAME OVER ---
    // Morre se olhar muito tempo de perto
    if (distance < 8.0 && isLookingAt > 0.7) {
        handleGameOver(true);
        return;
    }
    
    // Morre se encostar
    let teleportTime;

    // PROGRESSÃO DE DIFICULDADE MANUAL
    switch (gameState.pagesCollected) {
        case 0:
            teleportTime = 15.0; // Bem lento no início (só da sustos de longe)
            break;
        case 1:
            teleportTime = 10.0;  // Começa a perseguição
            break;
        case 2:
            teleportTime = 5.0;  // Fica agressivo
            break;
        default:
            // 3 ou mais (Fase da Fogueira): MODO PESADELO
            teleportTime = 2.5;  
            break;
    }

    // Garante que não fique rápido demais (mínimo 1 segundo) nem negativo
    const currentInterval = Math.max(1.0, teleportTime);

    if (slenderLogic.lastTeleport > currentInterval) {
        teleportSlenderman(playerDirection);
        slenderLogic.lastTeleport = 0;
    }
}

function teleportSlenderman(playerViewDir) {
    // Chance de aparecer na frente do jogador (assustador) aumenta com páginas
    const chanceToSpawnInFront = 0.2 + (gameState.pagesCollected * 0.15);
    const angle = Math.random();

    let spawnPos = new THREE.Vector3();
    const dist = slenderLogic.minDistance + Math.random() * (slenderLogic.maxDistance - slenderLogic.minDistance);

    if (angle < chanceToSpawnInFront) {
        // Spawna na frente (dentro do campo de visão)
        // Pega a posição do player + vetor da direção * distância
        spawnPos.copy(player.position).add(playerViewDir.multiplyScalar(dist));
    } else {
        // Spawna aleatoriamente ao redor (flanco ou costas)
        const randomAngle = Math.random() * Math.PI * 2;
        spawnPos.set(
            player.position.x + Math.cos(randomAngle) * dist,
            player.position.y, // Mantém altura
            player.position.z + Math.sin(randomAngle) * dist
        );
    }

    if (gameState.pagesCollected <= 1) {
        const dist = spawnPos.distanceTo(player.position);
        if (dist < 15.0) {
            // Se cair a menos de 15 metros, aborta o teleporte ou joga pra longe
            // Aqui vamos só jogar ele mais pra trás na mesma direção
            spawnPos.add(playerViewDir.multiplyScalar(10)); 
        }
    }

    // Ajusta altura para o chão
    spawnPos.y = 2.68; 

    // Atualiza posição
    slenderman.position.copy(spawnPos);
}

function handleGameOver(wasCaught) {
    if (gameState.gameOver) return;
    
    gameState.gameOver = true;
    document.exitPointerLock();
    crosshair.style.display = 'none';
    uiContainer.style.display = 'none';

    // Para os passos e a estática normal
    if (soundFootsteps && soundFootsteps.isPlaying) soundFootsteps.stop();
    if (soundStatic) soundStatic.stop();

    if (wasCaught) {
        // TOCA O JUMPSCARE
        if (soundJumpscare) soundJumpscare.play();

        staticElement.style.opacity = '1'; 
        loseMessage.innerHTML = '<h2>VOCÊ FOI PEGO!</h2><p>A criatura te alcançou na escuridão.</p>';
    } else {
        staticElement.style.opacity = '0.2';
        loseMessage.innerHTML = '<h2>FIM DE JOGO</h2><p>A bateria acabou... A escuridão te consumiu.</p>';
    }
    loseMessage.style.display = 'block';
}

function handleGameWin() {
    if (gameState.gameWon) return;

    gameState.gameWon = true;
    document.exitPointerLock();
    
    // Parar sons
    if (soundFootsteps) soundFootsteps.stop();
    if (soundStatic) soundStatic.stop();
    // Tocar som de vitória/alívio se tiver
    if (soundAmbience) soundAmbience.stop();

    crosshair.style.display = 'none';
    uiContainer.style.display = 'none';
    
    // Mensagem atualizada
    winMessage.innerHTML = '<h1>MALDIÇÃO QUEBRADA!</h1><p>As chamas consumiram as páginas... O Slenderman desapareceu.</p><p>Pressione F5 para jogar novamente.</p>';
    
    // Dica de estilo: Mudar a cor para laranja/amarelo
    winMessage.style.color = '#ffaa00';
    
    winMessage.style.display = 'block';
}

function initMinimap() {
    // Container do Mapa (Fundo preto semitransparente)
    minimapContainer = document.createElement('div');
    Object.assign(minimapContainer.style, {
        position: 'absolute',
        top: '20px',
        right: '20px',
        width: `${mapSize}px`,
        height: `${mapSize}px`,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        border: '2px solid #444',
        borderRadius: '50%', // Redondo estilo radar
        overflow: 'hidden',
        zIndex: '100',
        display: 'block'
    });
    document.body.appendChild(minimapContainer);

    // Marcador do Jogador (Seta ou ponto)
    playerMarker = document.createElement('div');
    Object.assign(playerMarker.style, {
        position: 'absolute',
        width: '10px',
        height: '10px',
        backgroundColor: '#00ff00', // Verde
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: '102'
    });
    minimapContainer.appendChild(playerMarker);

    // Marcador da Casa (Ícone azul)
    houseMarker = document.createElement('div');
    Object.assign(houseMarker.style, {
        position: 'absolute',
        width: '12px',
        height: '12px',
        backgroundColor: '#00aaff', // Azul
        border: '1px solid white',
        transform: 'translate(-50%, -50%)',
        zIndex: '101'
    });
    minimapContainer.appendChild(houseMarker);

    // Marcador da Fogueira (Ícone Laranja)
    fireMarker = document.createElement('div');
    Object.assign(fireMarker.style, {
        position: 'absolute',
        width: '10px',
        height: '10px',
        backgroundColor: '#ff5500', // Laranja
        borderRadius: '50%',
        boxShadow: '0 0 5px #ff5500',
        transform: 'translate(-50%, -50%)',
        zIndex: '101',
        display: 'none' // Começa invisível até a fogueira ser criada
    });
    minimapContainer.appendChild(fireMarker);

    // Texto de ajuda
    const mapHelp = document.createElement('div');
    mapHelp.innerText = "[M] Mapa";
    Object.assign(mapHelp.style, {
        position: 'absolute',
        bottom: '-25px',
        right: '0',
        width: '100%',
        textAlign: 'center',
        color: 'white',
        fontFamily: 'Arial',
        fontSize: '12px'
    });
    minimapContainer.appendChild(mapHelp);
}

function updateMinimap() {
    if (!isMapVisible || !player) return;

    // O centro do mapa na tela
    const cx = mapSize / 2;
    const cy = mapSize / 2;

    // Posição do jogador no mundo
    const px = player.position.x;
    const pz = player.position.z;

    // --- ATUALIZAR JOGADOR ---
    // No estilo "Radar Fixo" (O jogador fica no centro, o mundo gira):
    // Vamos fazer o estilo "Mapa Estático" (O jogador se move no mapa), que é mais fácil de ler para achar itens.

    // Converter Mundo (-100 a 100) para Mapa (0 a 200)
    // Assumindo que o mapa tem +-100 de tamanho
    const mapPlayerX = cx + (px * mapScale);
    const mapPlayerY = cy + (pz * mapScale);

    playerMarker.style.left = `${mapPlayerX}px`;
    playerMarker.style.top = `${mapPlayerY}px`;

    // Rotacionar seta do jogador com a câmera (opcional, mas legal)
    // Pegamos a rotação Y da câmera para girar a seta
    // playerMarker.style.transform = `translate(-50%, -50%) rotate(${-player.rotation.y}rad)`;

    // --- ATUALIZAR CASA ---
    const mapHouseX = cx + (housePos.x * mapScale);
    const mapHouseY = cx + (housePos.z * mapScale);
    houseMarker.style.left = `${mapHouseX}px`;
    houseMarker.style.top = `${mapHouseY}px`;

    // --- ATUALIZAR FOGUEIRA ---
    if (campfirePos.lengthSq() > 0) { // Se já foi definida
        fireMarker.style.display = 'block';
        const mapFireX = cx + (campfirePos.x * mapScale);
        const mapFireY = cx + (campfirePos.z * mapScale);
        fireMarker.style.left = `${mapFireX}px`;
        fireMarker.style.top = `${mapFireY}px`;
    }

    // --- ATUALIZAR PÁGINAS (O ponto principal) ---
    // Primeiro, removemos os pontos antigos de página para redesenhar (forma simples)
    // Nota: Para otimização extrema, faríamos pool, mas para 8 páginas isso é ok.
    const existingPageDots = document.querySelectorAll('.page-dot');
    existingPageDots.forEach(dot => dot.remove());

    pages.forEach(page => {
        const dot = document.createElement('div');
        dot.className = 'page-dot'; // Marcador para podermos remover depois
        Object.assign(dot.style, {
            position: 'absolute',
            width: '6px',
            height: '6px',
            backgroundColor: '#ff0000', // Vermelho
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: '100'
        });

        const mapPageX = cx + (page.position.x * mapScale);
        const mapPageY = cx + (page.position.z * mapScale);

        dot.style.left = `${mapPageX}px`;
        dot.style.top = `${mapPageY}px`;

        minimapContainer.appendChild(dot);
    });
}


function initLoadingUI() {
    // Fundo preto cobrindo a tela
    loadingScreen = document.createElement('div');
    Object.assign(loadingScreen.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        zIndex: '1000', // Fica na frente de tudo
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'Arial, sans-serif'
    });

    // Texto "Carregando..."
    loadingText = document.createElement('div');
    loadingText.innerText = "Carregando Pesadelos... 0%";
    loadingText.style.color = '#ffffff';
    loadingText.style.marginBottom = '20px';
    loadingText.style.fontSize = '20px';
    loadingScreen.appendChild(loadingText);

    // Container da Barra (borda)
    const barContainer = document.createElement('div');
    Object.assign(barContainer.style, {
        width: '300px',
        height: '20px',
        border: '2px solid #ffffff',
        borderRadius: '10px',
        overflow: 'hidden'
    });
    loadingScreen.appendChild(barContainer);

    // A Barra em si (preenchimento)
    loadingBar = document.createElement('div');
    Object.assign(loadingBar.style, {
        width: '0%',
        height: '100%',
        backgroundColor: '#ff0000', // Vermelho sangue
        transition: 'width 0.2s'
    });
    barContainer.appendChild(loadingBar);

    document.body.appendChild(loadingScreen);
}