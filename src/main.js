import * as THREE from "three";
import GUI from "lil-gui";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

const wireButton = document.querySelector(".btn-wireframe");
wireButton.addEventListener("click", () => {
  showWireOverlay(5.0); // Show wireframe overlay for 7 seconds
});

const wireColor = new THREE.Color(1.0, 0.5, 0.0); // naranja ZBrush
let fadeProgress = 0.0;
let fadeTimer = 0.0;
let fadeDuration = 2.0;
let showingWire = false;
let scanning = false;

//Sizes
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

/**
 * Debug
 */
const gui = new GUI();
gui.close();

const envMap = {
  studio: "/hdri/studio_small_08_1k.hdr",
  studio_2: "/hdri/studio_small_09_1k.hdr",
  studio_3: "/hdri/studio_small_01_1k.hdr",
  studio_4: "/hdri/studio_small_02_1k.hdr",
  studio_5: "/hdri/studio_small_05_1k.hdr",
};
const toneMappingOptions = {
  None: THREE.NoToneMapping,
  Linear: THREE.LinearToneMapping,
  Reinhard: THREE.ReinhardToneMapping,
  Cineon: THREE.CineonToneMapping,
  ACESFilmic: THREE.ACESFilmicToneMapping,
};

const debugObject = {
  envMapIntensity: 0.6,
  environmet: envMap.studio_2,
  renderToneMapping: toneMappingOptions.ACESFilmic,
  renderToneMappingExposure: 1.6,
  animation: true,
  bloomStrength: 0.2,
  bloomRadius: 0.2,
  bloomThreshold: 0.5,
};

const sceneObject = gui.addFolder("Scene");
sceneObject
  .add(debugObject, "envMapIntensity")
  .min(0.2)
  .max(1.6)
  .step(0.1)
  .onChange((value) => {
    if (scene.environment) {
      scene.environmentIntensity = value;
    }
  });
sceneObject
  .add(debugObject, "environmet", envMap)
  .name("Environment Map")
  .onChange((value) => {
    rgbeLoader.load(value, (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
      scene.environmentIntensity = debugObject.envMapIntensity;
      console.log("HDR texture loaded successfully");
    });
  });

const ModelObject = gui.addFolder("Model Options");
ModelObject.add(
  { triggerWireScan: () => showWireOverlay() },
  "triggerWireScan"
).name("Trigger Wire Scan");
//bloom
ModelObject.add(debugObject, "bloomStrength")
  .min(0)
  .max(2)
  .step(0.01)
  .name("Bloom Strength");
ModelObject.add(debugObject, "bloomRadius")
  .min(0)
  .max(1)
  .step(0.01)
  .name("Bloom Radius");
ModelObject.add(debugObject, "bloomThreshold")
  .min(0)
  .max(1)
  .step(0.01)
  .name("Bloom Threshold");

const animationOptions = gui.addFolder("Animation Options");
animationOptions.add(debugObject, "animation").name("Enable Animation");

//Scene
const scene = new THREE.Scene();

//Camera
const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.01,
  100
);

//initial camera position
camera.position.z = 3;
camera.position.y = 0.6;
camera.lookAt(0, 0, 0); // Look at the center of the scene
scene.add(camera);

//Renderer
const canvas = document.querySelector(".webgl");
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = debugObject.renderToneMapping;
renderer.toneMappingExposure = 1.6;
renderer.physicallyCorrectLights = true;
renderer.outputEncoding = THREE.sRGBEncoding;

//Controls
const controls = new OrbitControls(camera, document.querySelector(".webgl"));
// Limitar zoom
controls.minDistance = 1.5;
controls.maxDistance = 5;
controls.enablePan = false; // Disable panning
controls.enableDamping = true; // an animation loop is required when either damping or auto-

/**
 * Loaders
 */
let model;
const ktk2Loader = new KTX2Loader();
ktk2Loader.setTranscoderPath("/basis/");
ktk2Loader.detectSupport(renderer);

//load wireTexture
const wireTexture = await new THREE.TextureLoader().loadAsync(
  "/model/muzen_wireframe.png"
);

const gltfLoader = new GLTFLoader();
gltfLoader.setKTX2Loader(ktk2Loader);
gltfLoader.load("/model/muzenspeaker-opt.glb", (gltf) => {
  model = gltf.scene;
  model.scale.set(15, 15, 15);
  model.position.set(0, -0.5, 0);
  camera.lookAt(model.position);
  scene.add(model);

  model.traverse((child) => {
    if (child.isMesh && child.material) {
      const mat = child.material;
      mat.transparent = true; // Ensure the material is transparent

      // Base color (albedo / diffuse)
      if (mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
      }

      // Normal map
      if (mat.normalMap) {
        mat.normalMap.colorSpace = THREE.LinearSRGBColorSpace;
      }

      // Roughness map
      if (mat.roughnessMap) {
        mat.roughnessMap.colorSpace = THREE.LinearSRGBColorSpace;
      }

      // Metalness map
      if (mat.metalnessMap) {
        mat.metalnessMap.colorSpace = THREE.LinearSRGBColorSpace;
      }

      // AO map
      if (mat.aoMap) {
        mat.aoMap.colorSpace = THREE.LinearSRGBColorSpace;
        console.log(mat.aoMap);
      }

      console.log(mat);
      const newMat = mat.clone();
      newMat.onBeforeCompile = (shader) => {
        // Inyectamos uniformes personalizados

        shader.uniforms.wireTexture = { value: wireTexture };
        shader.uniforms.wireColor = { value: wireColor };
        shader.uniforms.fadeProgress = { value: fadeProgress };

        shader.vertexShader = shader.vertexShader.replace(
          "#include <uv_pars_vertex>",
          `#include <uv_pars_vertex>
      varying vec2 vUv;`
        );

        shader.vertexShader = shader.vertexShader.replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>
      vUv = uv;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <uv_pars_fragment>",
          `#include <uv_pars_fragment>
      varying vec2 vUv;
      uniform float fadeProgress;
      uniform sampler2D wireTexture;
      uniform vec3 wireColor;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <map_fragment>",
          `#include <map_fragment>

      vec2 correctedUV = vec2(vUv.x, 1.0 - vUv.y);
      vec4 wireTexel = texture2D(wireTexture, correctedUV);
      float wireAlpha = wireTexel.r * fadeProgress;
      vec3 wireFinal = mix(diffuseColor.rgb, wireColor.rgb, wireAlpha);
      diffuseColor.rgb = wireFinal;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
      totalEmissiveRadiance += wireColor * wireTexel.r * fadeProgress * 7.0;`
        );

        child.userData.shaderRef = shader; // opcional: para acceder luego
      };
      child.material = newMat;
    }
  });
});

const rgbeLoader = new RGBELoader();
rgbeLoader.load("/hdri/studio_small_08_1k.hdr", (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = texture;
  scene.environmentIntensity = debugObject.envMapIntensity;
});

//render debug
const renderOptions = gui.addFolder("Render Options");
renderOptions
  .add(renderer, "toneMapping", toneMappingOptions)
  .name("Tone Mapping")
  .onChange((value) => {
    renderer.toneMapping = value;
    renderer.toneMappingExposure = debugObject.renderToneMappingExposure; // Reset exposure to a default value
  });
renderOptions
  .add(debugObject, "renderToneMappingExposure")
  .min(0.1)
  .max(3)
  .step(0.1)
  .name("Tone Mapping Exposure")
  .onChange((value) => {
    renderer.toneMappingExposure = value;
  });

//Resize
window.addEventListener("resize", () => {
  //Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  //Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  //Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});
//POST PROCESSING
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(sizes.width, sizes.height),
  debugObject.bloomStrength,
  debugObject.bloomRadius,
  debugObject.bloomThreshold
);
composer.addPass(bloomPass);

//Animate
const clock = new THREE.Clock();
function showWireOverlay(duration = 7.0) {
  fadeProgress = 0.0;
  fadeTimer = clock.getElapsedTime();
  fadeDuration = duration;
  showingWire = true;
}

const tick = () => {
  const elapsedTime = clock.getElapsedTime();

  //Update objects
  if (model && debugObject.animation) {
    // Rotate the model for some basic animation
    model.rotation.y = elapsedTime * 0.3; // Rotate around Y-axis
  }

  if (showingWire) {
    const timeSinceStart = elapsedTime - fadeTimer; // Calculate elapsed time since the fade started
    console.log(timeSinceStart);
    fadeProgress = Math.min(timeSinceStart / fadeDuration, 1.0);

    model.traverse((child) => {
      if (child.isMesh && child.userData.shaderRef) {
        child.userData.shaderRef.uniforms.fadeProgress.value =
          1.0 - Math.abs(1.0 - 2.0 * fadeProgress); // Fade in-out
      }
    });

    if (fadeProgress >= 1.0) {
      showingWire = false;
    }
  }
  //update controls
  controls.update();

  //Render
  composer.render();

  //Call tick again on the next frame
  window.requestAnimationFrame(tick);
};
tick();
