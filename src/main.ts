import {vec3, vec4, mat4} from 'gl-matrix';
import * as Stats from 'stats-js';
import * as DAT from 'dat-gui';
import Icosphere from './geometry/Icosphere';
import Square from './geometry/Square';
import Ground from './geometry/Ground';
import BuildingBase from './geometry/BuildingBase';
import {BuildingBlock} from './geometry/BuildingBase';
import Cube from './geometry/Cube';
import Mesh from './geometry/Mesh';
import OpenGLRenderer from './rendering/gl/OpenGLRenderer';
import Camera from './Camera';
import {setGL} from './globals';
import ShaderProgram, {Shader} from './rendering/gl/ShaderProgram';
import { isContext } from 'vm';
import { emit } from 'cluster';
import {ShapeGrammarNode, ShapeGrammar} from './ShapeGrammarNode';
import Object from './objLoader';

// Define an object with application parameters and button callbacks
// This will be referred to by dat.GUI's functions that add GUI elements.
const controls = {
  // geometry : SQUARE,
  // tesselations: 5,
  // 'Load Scene': loadScene, // A function pointer, essentially
  // shaderProg : LAMBERT,
  // color : [ 140, 140, 140 ], // RGB array

  debugShadow: false,
  'Camera Info' : printCameraInfo,
};

// Setup camera
const camera = new Camera(vec3.fromValues(0, 250, 250), vec3.fromValues(0, 0, 0));

function printCameraInfo(){
  console.log(camera.controls.eye);
  console.log(camera.controls.center);
}

// let icosphere: Icosphere;
let square: Square;
let ground: Ground;
let buildingBase: BuildingBase;
let cube : Cube;
let buildings: Mesh;

// TODO: add other objs here
// Objs
let obj_Cube: Object;
let obj_Pyramid: Object;
let obj_TopCube: Object;
let obj_CubeRepeat: Object;
// let obj_Cylinder: Object;
let obj_Tree: Object;

// gl context and render
var gl: WebGL2RenderingContext;
var renderer: OpenGLRenderer;

// store all shape grammar nodes of the scene
var sceneShapeGrammarNodes: Array<ShapeGrammarNode>;

// these are data to be pushed to VBO
var indices: number[] = [];
var nor: number[] = [];
var pos: number[] = [];
var col: number[] = [];

// identity model matrix
let identityModel = mat4.create();
mat4.identity(identityModel);

var noBuildingBlockIdx: Array<number>;

var shadow: ShaderProgram;


// ------------------------------------------------------------
// TODO: initialize other objects here
function initObjs(){
  obj_Cube = new Object("Cube");
  obj_Pyramid = new Object("Cylinder");
  obj_TopCube = new Object("TopCube");
  obj_CubeRepeat = new Object("CubeRepeat");
  // obj_Cylinder = new Object("Cylinder");
  obj_Tree = new Object("Tree");
}



// ------------------------------------------------------------
function loadScene() {
  // icosphere = new Icosphere(vec3.fromValues(0, 0, 0), 1, controls.tesselations);
  // icosphere.create();

  square = new Square(vec3.fromValues(0, 0, 0));
  square.create();

  ground = new Ground(vec3.fromValues(0, 0, 0), 1000.0);
  ground.create();

  buildingBase = new BuildingBase(vec3.fromValues(0, 1.0, 0,), 1000.0, 12, 12, 18.0, 35.0);
  buildingBase.create(); 

  cube = new Cube(vec3.fromValues(0, 0, 0));
  cube.create();

  buildings = new Mesh();
}


// ---------------------------------------------------------------------------
// ----------------------- create VBO & shadow map --------------------------
// ----------------------------------------------------------------------------

function GenerateMergedBuildingMeshAndShadowMap(){  
    let targetObj;

    // create VBO based on 
    // scene shape grammar nodes AND objs
    for(let i = 0; i < sceneShapeGrammarNodes.length; i++){
      // select a object to construct
      if(sceneShapeGrammarNodes[i].geometryType == "Cube"){
        targetObj = obj_Cube;  
      }
      else if(sceneShapeGrammarNodes[i].geometryType == "Pyramid"){
        targetObj = obj_Pyramid;
      }
      else if(sceneShapeGrammarNodes[i].geometryType == "TopCube"){
        targetObj = obj_TopCube;
      }
      else if(sceneShapeGrammarNodes[i].geometryType == "CubeRepeat"){
        targetObj = obj_CubeRepeat;
      }
      // else if(sceneShapeGrammarNodes[i].geometryType == "Cylinder"){
      //   targetObj = obj_Cylinder;
      // }
      else{
        // TODO: set other obj types
      }

      // add vbo For one grammar shape node
      let indexOffset = indices.length;

      // rotation matrix
      let rotMat = mat4.create();
      mat4.identity(rotMat);
      mat4.rotateX(rotMat, rotMat, sceneShapeGrammarNodes[i].rot[0]); // remember this is radius
      mat4.fromYRotation(rotMat, sceneShapeGrammarNodes[i].rot[1]);
      mat4.rotateZ(rotMat, rotMat, sceneShapeGrammarNodes[i].rot[2]);

      // For each triangle of mesh
      for (let _i = 0; _i < targetObj.faces_indices.length; _i++) {
        // index
        indices.push(indexOffset + 3 * _i + 0);
        indices.push(indexOffset + 3 * _i + 1);
        indices.push(indexOffset + 3 * _i + 2);

        // position
        let vertexIdx = targetObj.faces_indices[_i];
        for(let j = 0; j < 3; j++){

          var tmpPos = vec3.fromValues(targetObj.vertices[vertexIdx[j]- 1][0], targetObj.vertices[vertexIdx[j]- 1][1], targetObj.vertices[vertexIdx[j]- 1][2]);
          
          // scale base
          tmpPos[2] = tmpPos[2] * sceneShapeGrammarNodes[i].scale[2]; 
          tmpPos[0] = tmpPos[0] * sceneShapeGrammarNodes[i].scale[0];
          
          // scale height
          tmpPos[1] = tmpPos[1] * sceneShapeGrammarNodes[i].scale[1];
          
          // rotate
          let tmpPos2 = vec4.fromValues(tmpPos[0], tmpPos[1], tmpPos[2], 1.0);
          vec4.transformMat4(tmpPos2, tmpPos2, rotMat);

          tmpPos[0] = tmpPos2[0]; tmpPos[1] = tmpPos2[1]; tmpPos[2] = tmpPos2[2];

          // translate
          let offsetPos = vec3.fromValues(sceneShapeGrammarNodes[i].pos[0], sceneShapeGrammarNodes[i].pos[1], sceneShapeGrammarNodes[i].pos[2]);
          
          vec3.add(tmpPos, tmpPos, offsetPos);

          pos.push(tmpPos[0]); // x
          pos.push(tmpPos[1]); // y
          pos.push(tmpPos[2]); // z
          pos.push(1.0);       // w

          // push color value
          // make bottom darker to simulate AO
          let darkColorScalar = 0.2;                                
          let scalar = (1.0 + darkColorScalar) - (sceneShapeGrammarNodes[i].buildingHeight - tmpPos[1]) / sceneShapeGrammarNodes[i].buildingHeight;

          col.push(scalar * sceneShapeGrammarNodes[i].baseCol[0]); // r
          col.push(scalar * sceneShapeGrammarNodes[i].baseCol[1]); // g
          col.push(scalar * sceneShapeGrammarNodes[i].baseCol[2]); // b
          col.push(1.0);               // a
        }

        // normal
        let normalIdx = targetObj.faces_normals[_i];
        for(let j = 0; j < 3; j++){

            var tmpNor = vec3.fromValues(targetObj.normals[normalIdx[j]- 1][0], targetObj.normals[normalIdx[j]- 1][1], targetObj.normals[normalIdx[j]- 1][2]);

            // transform normal 
            let tmpNor2 = vec4.fromValues(tmpNor[0], tmpNor[1], tmpNor[2], 0.0);
            vec4.transformMat4(tmpNor2, tmpNor2, rotMat);
  
            tmpNor[0] = tmpNor2[0]; tmpNor[1] = tmpNor2[1]; tmpNor[2] = tmpNor2[2];

            nor.push(tmpNor[0]); // x
            nor.push(tmpNor[1]); // y
            nor.push(tmpNor[2]); // z
            nor.push(0.0);       // w
        }
      }
    }

    // create VBO from "small" blocks
    targetObj = obj_Tree;
    let base_treeScale = 10.0;
    // For every block
    for(let i = 0; i < noBuildingBlockIdx.length; i++){
      let thisSmallBlock = buildingBase.buildingBlocks[noBuildingBlockIdx[i]];
      let centroid = vec3.fromValues(0.25 * (thisSmallBlock.pos1[0] + thisSmallBlock.pos2[0] + thisSmallBlock.pos3[0] + thisSmallBlock.pos4[0]),
                                     0.25 * (thisSmallBlock.pos1[1] + thisSmallBlock.pos2[1] + thisSmallBlock.pos3[1] + thisSmallBlock.pos4[1]),
                                     0.25 * (thisSmallBlock.pos1[2] + thisSmallBlock.pos2[2] + thisSmallBlock.pos3[2] + thisSmallBlock.pos4[2])
                                    );

      let indexOffset = indices.length;
      
      // color of this tree
      let tmp =  0.2 + Math.random();
      let thisTreeColor = vec3.fromValues(tmp, tmp, tmp);
      
      // scale of this tree
      let treeScale = base_treeScale + 3.0 * Math.random();
      // For each triangle of mesh
      for (let _i = 0; _i < targetObj.faces_indices.length; _i++) {
        // index
        indices.push(indexOffset + 3 * _i + 0);
        indices.push(indexOffset + 3 * _i + 1);
        indices.push(indexOffset + 3 * _i + 2);

        // position
        let vertexIdx = targetObj.faces_indices[_i];
        for(let j = 0; j < 3; j++){

          var tmpPos = vec3.fromValues(targetObj.vertices[vertexIdx[j]- 1][0], targetObj.vertices[vertexIdx[j]- 1][1], targetObj.vertices[vertexIdx[j]- 1][2]);
          
          // scale 
          tmpPos[2] = tmpPos[2] * treeScale; 
          tmpPos[0] = tmpPos[0] * treeScale;
          tmpPos[1] = tmpPos[1] * treeScale;
          
          // translate
          let offsetPos = vec3.fromValues(centroid[0], centroid[1], centroid[2]);
          
          vec3.add(tmpPos, tmpPos, offsetPos);

          pos.push(tmpPos[0]); // x
          pos.push(tmpPos[1]); // y
          pos.push(tmpPos[2]); // z
          pos.push(1.0);       // w

          col.push(thisTreeColor[0]); // r
          col.push(thisTreeColor[1]); // g
          col.push(thisTreeColor[2]); // b
          col.push(1.0);               // a
        }

        // normal
        let normalIdx = targetObj.faces_normals[_i];
        for(let j = 0; j < 3; j++){

            var tmpNor = vec3.fromValues(targetObj.normals[normalIdx[j]- 1][0], targetObj.normals[normalIdx[j]- 1][1], targetObj.normals[normalIdx[j]- 1][2]);

            nor.push(tmpNor[0]); // x
            nor.push(tmpNor[1]); // y
            nor.push(tmpNor[2]); // z
            nor.push(0.0);       // w
        }
      }                               
    }

    // create merged buildings mesh
    buildings.createMesh(indices, pos, nor, col);
  
    // Bake ShadowMap once buildings mesh have been created
    let lightPos = vec3.fromValues(250, 600, 250); // This lightPos should be consistent with the light pos in lambert shaders
    renderer.renderShadow(lightPos, window.innerWidth / window.innerHeight, shadow, [
      buildings,
    ], identityModel);
  
    // reset clear color to normal clear color
    renderer.setClearColor(242.0 / 255.0, 242.0 / 255.0, 242.0 / 255.0, 1.0);
}


// ------------------------------------------------------------
// assign intial shape grammar nodes(in our case, cube) based on city blocks
function InitializeShapeGrammarNodes(blocks: Array<BuildingBlock>, shapeGrammar: ShapeGrammar){

  var buildingSize = 20.0; // one estimated block size
  var buildingSizeRandomness = 4.0;

  var numOfBuildingsInRowAdjustment    = -1; // adjust row space between buildings in one block
  var numOfBuildingsInColumnAdjustment = -1; // adjust col space between buildings in one block

  noBuildingBlockIdx = [];

  // Add Buildings For each block 
  for(let i = 0; i < blocks.length; i++){
      
      let numOfBuildingsInRow    = Math.floor((blocks[i].pos2[0] - blocks[i].pos1[0]) / buildingSize);
      let numOfBuildingsInColumn = Math.floor((blocks[i].pos4[2] - blocks[i].pos1[2]) / buildingSize);
      
      numOfBuildingsInRow = numOfBuildingsInRow + numOfBuildingsInRowAdjustment;
      numOfBuildingsInColumn = numOfBuildingsInColumn + numOfBuildingsInColumnAdjustment;

      let offsetInRow    = ((blocks[i].pos2[0] - blocks[i].pos1[0]) - numOfBuildingsInRow * buildingSize) / (numOfBuildingsInRow + 1.0);
      let offsetInColumn = ((blocks[i].pos4[2] - blocks[i].pos1[2]) - numOfBuildingsInColumn * buildingSize) / (numOfBuildingsInColumn + 1.0);

      let startingPosX = blocks[i].pos1[0];
      let startingPosY = blocks[i].pos1[1];
      let startingPosZ = blocks[i].pos1[2];

      // skip too small blocks, and we'll make it a park
      if(numOfBuildingsInRow <= 0 || numOfBuildingsInColumn <= 0){
        noBuildingBlockIdx.push(i);
        continue;
      }

      // For one block
      for(let _column = 0; _column < numOfBuildingsInColumn; _column++){
        for(let _row = 0; _row < numOfBuildingsInRow; _row++){

          let indexOffset = indices.length;
          
          // initalize parameters For one building

          // height should based on some kind of density + some random number with some range
          let thisBuildingHeight = blocks[i].populationDensity * 30.0 + Math.random() * 40.0;
          let thisBuildingSize = buildingSize + (Math.random() - 0.5) * buildingSizeRandomness;            
          let thisBuildingColor = vec3.create();
          if(Math.random() < 0.02){
            thisBuildingColor = vec3.fromValues(164.0/255.0, 41.0/255.0, 41.0/255.0);
          }
          else{
            let tmp =  0.2 + Math.random();
            thisBuildingColor = vec3.fromValues(tmp, tmp, tmp);
          }
          
          // TODO: generate different types of nodes here!
          // For normal height building
          let symbol = "A"; 
          let geomType = "Cube"
          let rot = vec3.fromValues(0, 0, 0);
          
          // For low height building
          if(thisBuildingHeight < 75.0 && Math.random() < 0.45){
            symbol = "E";
          }


          // create the very initial shape grammar node for this building
          // "A" -> Most basic cube
          let thisShapeGrammarNode = new ShapeGrammarNode(symbol,    // symbol
                                                          geomType,    // geom type
                                                          // pos
                                                          vec3.fromValues(startingPosX + (_row + 0.5) * buildingSize + (_row + 1.0) * offsetInRow, 
                                                                          startingPosY, 
                                                                          startingPosZ + (_column + 0.5) * buildingSize + (_column + 1.0) * offsetInColumn),
                                                          // rot
                                                          rot,
                                                          // scale
                                                          vec3.fromValues(thisBuildingSize, thisBuildingHeight, thisBuildingSize),
                                                          // color
                                                          thisBuildingColor,
                                                          // whole building height
                                                          thisBuildingHeight,
                                                          // is terminal
                                                          false);
          // add this node to shape grammar
          shapeGrammar.nodeSet.push(thisShapeGrammarNode);

        }
      } 
  }
}


function GenerateSceneShapeGrammarNode(blocks: Array<BuildingBlock>, shapeGrammar: ShapeGrammar, iterations: number){

  // reset shape grammar (clear nodes, rules are same)
  shapeGrammar.reset();
  
  // set initial nodes
  InitializeShapeGrammarNodes(blocks, shapeGrammar);
  
  // clear scene nodes
  sceneShapeGrammarNodes = [];

  // parse & iterate and get new nodes array
  sceneShapeGrammarNodes = shapeGrammar.parseShapeGrammar(iterations);

}


// ------------------------------------------------------------
// TODO : add new obj load func as callback of a callback
function LoadObjFromfiles(){
  obj_Pyramid.create("./obj/pyramid.obj", function(){
    obj_TopCube.create("./obj/topCube.obj", function(){
      obj_CubeRepeat.create("./obj/cubeRepeat.obj", function(){
        // obj_Cylinder.create("./obj/cylinder.obj", function(){
          obj_Tree.create("./obj/tree.obj", function(){
            obj_Cube.create("./obj/cubeNoBottom.obj", GenerateMergedBuildingMeshAndShadowMap);
          });
        // });
      });
    });
  });
}



// ------------------------------------------------------------
function main() {
  // Initial display for framerate
  const stats = Stats();
  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0px';
  stats.domElement.style.top = '0px';
  document.body.appendChild(stats.domElement);

  // get canvas and webgl context
  const canvas = <HTMLCanvasElement> document.getElementById('canvas');
  gl = <WebGL2RenderingContext> canvas.getContext('webgl2');
  if (!gl) {
    alert('WebGL 2 not supported!');
  }

  // `setGL` is a function imported above which sets the value of `gl` in the `globals.ts` module.
  // Later, we can import `gl` from `globals.ts` to access it
  setGL(gl);

  // Initial call to load scene
  loadScene();

  // Initialze objs
  initObjs();


  // ------------------------------------------------------------
  // GUI
  const gui = new DAT.GUI();

  // Add controls to the gui
  // gui.add(controls, 'geometry', [SQUARE, ICOSPHERE, CUBE]).onChange(setGeometry);
  // gui.add(controls, 'tesselations', 0, 8).step(1).onChange(setTesselation);
  // gui.add(controls, 'Load Scene');
  gui.add(controls, 'debugShadow');
  gui.add(controls, 'Camera Info');

  // OpenGL Renderer
  renderer = new OpenGLRenderer(canvas);
  gl.enable(gl.DEPTH_TEST);


  // ------------------------------------------------------------
  // setup lambert shaders
  const lambert_ground = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/lambert-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/lambert-frag.glsl')),
  ]);
  lambert_ground.setGeometryColor(vec4.fromValues(231.0 / 255.0, 231.0 / 255.0, 231.0 / 255.0, 1.0));
  
  const lambert_buildingBase = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/lambert-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/lambert-frag.glsl')),
  ]);
  lambert_buildingBase.setGeometryColor(vec4.fromValues(184.0 / 255.0, 184.0 / 255.0, 184.0 / 255.0, 1.0));

  const lambert_building = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/lambert-building-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/lambert-building-frag.glsl')),
  ]);
  lambert_building.setGeometryColor(vec4.fromValues(50.0 / 255.0, 50.0 / 255.0, 50.0 / 255.0, 1.0));

  shadow = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/light-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/light-frag.glsl')),
  ]);

  // shadow map debug quad 
  const quad = new ShaderProgram([
    new Shader(gl.VERTEX_SHADER, require('./shaders/quad-vert.glsl')),
    new Shader(gl.FRAGMENT_SHADER, require('./shaders/quad-frag.glsl')),
  ]);

  // ------------------------------------------------------------
  var shapeGrammar = new ShapeGrammar();
  // TODO: add rules here
  shapeGrammar.addProduction("A -> BBB");
  shapeGrammar.addProduction("A -> BBBC");  
  shapeGrammar.addProduction("A -> BBBBB");    
  shapeGrammar.addProduction("A -> BBBBBC");  
  shapeGrammar.addProduction("E -> GGGGG");  
  
  // shapeGrammar.addProduction("A -> BBBC");
  // shapeGrammar.addProduction("A -> BBBBBC");

  var iterations = 0;

  // generate shape grammar nodes after iteration
  GenerateSceneShapeGrammarNode(buildingBase.getBuildingBlocks(), shapeGrammar, iterations);

  // load objs
  LoadObjFromfiles();


  // ------------------------------------------------------------
  // This function will be called every frame
  function tick() {
    camera.update();
    stats.begin();
    gl.viewport(0, 0, window.innerWidth, window.innerHeight);
    
    // clear and render
    renderer.clear();
    if(controls.debugShadow){
      // Shadow map debug view
      renderer.render(camera, quad, [
          square,
      ], identityModel);
    }
    else{
      // Ground
      renderer.render(camera, lambert_ground, [
        ground,
      ], identityModel);

      // Building Base
      renderer.render(camera, lambert_buildingBase, [
        buildingBase,
      ], identityModel);
      
      // Buildings
      renderer.render(camera, lambert_building, [
        buildings,
      ], identityModel);
    }
    
    stats.end();

    // Tell the browser to call `tick` again whenever it renders a new frame
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', function() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.setAspectRatio(window.innerWidth / window.innerHeight);
    camera.updateProjectionMatrix();
  }, false);

  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.setAspectRatio(window.innerWidth / window.innerHeight);
  camera.updateProjectionMatrix();

  // Start the render loop
  tick();
}

main();
