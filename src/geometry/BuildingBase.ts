import {vec2, vec3, vec4} from 'gl-matrix';
import Drawable from '../rendering/gl/Drawable';
import {gl} from '../globals';
import { performance } from 'perf_hooks';

// Four positions to define a block
export interface BuildingBlock{
    pos1: vec3;
    pos2: vec3;
    pos3: vec3;
    pos4: vec3;
    populationDensity: number;
};


// ------------------------------------------------------------------------------
// ----------------- Perlin Noise to generate block population density ----------
// ------------------------------------------------------------------------------
function random2(p: vec2 ): vec2 {

  let tmp = vec2.fromValues(vec2.dot(p, vec2.fromValues(127.1,311.7)), vec2.dot(p,vec2.fromValues(269.5,183.3)));
  tmp[0] = Math.sin(tmp[0]) * 43758.5453;
  tmp[1] = Math.sin(tmp[1]) * 43758.5453;

  tmp[0] = tmp[0] - Math.floor(tmp[0]);
  tmp[1] = tmp[1] - Math.floor(tmp[1]);

  tmp[0] = 2.0 * tmp[0] - 1.0;
  tmp[1] = 2.0 * tmp[1] - 1.0;

  vec2.normalize(tmp, tmp);

  return tmp;
}

function surflet(P: vec2, gridPoint: vec2): number
{
    // Compute falloff function by converting linear distance to a polynomial
    let distX = Math.abs(P[0] - gridPoint[0]);
    let distY = Math.abs(P[1] - gridPoint[1]);
    let tX = 1.0 - 6.0 * Math.pow(distX, 5.0) + 15.0 * Math.pow(distX, 4.0) - 10.0 * Math.pow(distX, 3.0);
    let tY = 1.0 - 6.0 * Math.pow(distY, 5.0) + 15.0 * Math.pow(distY, 4.0) - 10.0 * Math.pow(distY, 3.0);

    // Get the random vector for the grid point
    let gradient = vec2.create();
    gradient  = random2(gridPoint);

    // Get the vector from the grid point to P
    let diff = vec2.create();
    vec2.subtract(diff, P, gradient);

    // Get the value of our height field by dotting grid->P with our gradient
    let height = vec2.dot(diff, gradient);

    // Scale our height field (i.e. reduce it) by our polynomial falloff function
    return height * tX * tY;
}

function PerlinNoise(uv: vec2): number
{
    // Tile the space
    let uvXLYL = vec2.create();
    uvXLYL[0] = Math.floor(uv[0]);
    uvXLYL[1] = Math.floor(uv[1]);

    let uvXHYL = vec2.create();
    uvXHYL[0] = Math.floor(uv[0]) + 1;
    uvXHYL[1] = Math.floor(uv[1]);

    let uvXHYH = vec2.create();
    uvXHYH[0] = Math.floor(uv[0]) + 1;
    uvXHYH[1] = Math.floor(uv[1]) + 1;

    let uvXLYH = vec2.create();
    uvXLYH[0] = Math.floor(uv[0]);
    uvXLYH[1] = Math.floor(uv[1]) + 1;

    return surflet(uv, uvXLYL) + surflet(uv, uvXHYL) + surflet(uv, uvXHYH) + surflet(uv, uvXLYH);
}

function PixelToGrid(pixel: vec2, size: number): vec2
{   
    // in our case, it's a SQUARE ground plane, so it should be 1:1
    let dimensions = vec2.fromValues(1.0, 1.0);

    let uv = vec2.create();
    uv[0] = pixel[0] / dimensions[0];
    uv[1] = pixel[1] / dimensions[1];

    // Account for aspect ratio
    uv[0] = uv[0] * dimensions[0] / dimensions[1];
    // Determine number of cells (NxN)
    uv[0] *= size;
    uv[1] *= size;

    return uv;
}




class BuildingBase extends Drawable {
  indices: Uint32Array;
  positions: Float32Array;
  normals: Float32Array;

  center: vec3;
  size: number;
  subdivisionX: number;
  subdivisionZ: number;
  streetWidth: number;
  subdivisionRandomness: number;
  mergeTimes: number;

  buildingBlocks: Array<BuildingBlock>; // this array stores blocks

  constructor(center: vec3, size: number, subdivisionX: number, subdivisionZ: number, streetWidth: number, subdivisionRandomness: number) {
    super(); // Call the constructor of the super class. This is required.

    this.center = vec3.fromValues(center[0], center[1], center[2]);
    this.size   = size;

    this.subdivisionX = subdivisionX;
    this.subdivisionZ = subdivisionZ;
    this.streetWidth = streetWidth;
    this.subdivisionRandomness = subdivisionRandomness;
    this.mergeTimes = 0.1 * subdivisionX * subdivisionZ; // how many times need to merge

    this.buildingBlocks = [];
  }

  genBuildingBlocks(){

    let startingX = this.center[0] - 0.5 * this.size;
    let startingY = this.center[1];
    let startingZ = this.center[2] - 0.5 * this.size;

    let stepX = this.size / this.subdivisionX;
    let stepZ = this.size / this.subdivisionZ;

    let subdivideLinesX = [];
    let subdivideLinesZ = [];

    // --------------------------------------------------------
    // -------------- generate subdivision lines --------------
    // --------------------------------------------------------

    // generate x direction subdivision lines
    subdivideLinesX.push(startingX);
    let lineX = startingX; // starting line
    let randomX = this.subdivisionRandomness; // how random lineXs are

    for(let i = 0; i < this.subdivisionX - 1; i++){
      // tmp is a random number from 0->1
      let tmp = Math.random() * 2.0 - 1.0;

      lineX += stepX;
      lineX += tmp * randomX;

      subdivideLinesX.push(lineX);
    }
    subdivideLinesX.push(this.center[0] + 0.5 * this.size); // finish line


    // generate z direction subdivision lines
    subdivideLinesZ.push(startingZ); // starting line
    let lineZ = startingX;
    let randomZ = this.subdivisionRandomness; // how random lineZs are

    for(let i = 0; i < this.subdivisionZ - 1; i++){
      // tmp is a random number from 0->1
      let tmp = Math.random() * 2.0 - 1.0;

      lineZ += stepZ;
      lineZ += tmp * randomZ;

      subdivideLinesZ.push(lineZ);
    }
    subdivideLinesZ.push(this.center[2] + 0.5 * this.size); // finish line
    

    // -------------------------------------------------------------
    // ---- Generate blocks based on previous subdivision lines ----
    // -------------------------------------------------------------
    let halfStreetWidth = 0.5 * this.streetWidth;

    for(let i = 0; i < this.subdivisionZ; i++){
      for(let j = 0; j < this.subdivisionX; j++){

        let _pos1 = vec3.fromValues(subdivideLinesX[j] + halfStreetWidth, startingY, subdivideLinesZ[i] + halfStreetWidth);
        let _pos2 = vec3.fromValues(subdivideLinesX[j+1] - halfStreetWidth, startingY, subdivideLinesZ[i] + halfStreetWidth);
        let _pos3 = vec3.fromValues(subdivideLinesX[j+1] - halfStreetWidth, startingY, subdivideLinesZ[i + 1] - halfStreetWidth);
        let _pos4 = vec3.fromValues(subdivideLinesX[j] + halfStreetWidth, startingY, subdivideLinesZ[i + 1] - halfStreetWidth);

        let centroid = vec3.fromValues(0.25 * (_pos1[0] + _pos2[0] + _pos3[0] + _pos4[0]), 
                                       0.25 * (_pos1[1] + _pos2[1] + _pos3[1] + _pos4[1]),
                                       0.25 * (_pos1[2] + _pos2[2] + _pos3[2] + _pos4[2]));

        let _uv = vec2.fromValues((centroid[0]-startingX)/this.size, (centroid[2]-startingZ)/this.size);

        let uv = vec2.create();
        uv = PixelToGrid(_uv, 4.0);
        uv[0] = 0.05 + uv[0];
        uv[1] = 0.05 + uv[1];
        let perlin = PerlinNoise(uv);
        perlin = 2.5 + (perlin + 1.0) * 0.5;

        if(perlin < 0.0){
          console.log(perlin);
        }
        
        this.buildingBlocks.push({pos1: _pos1,
                                  pos2: _pos2,
                                  pos3: _pos3,
                                  pos4: _pos4,
                                  populationDensity: perlin});

      }
    }
  }

  mergeBlocks(){
    let count = 0;
    let hash: Set<number> = new Set(); // this set is used to mark "dirty" blocks
    var mergedBlocks: Array<BuildingBlock> = [];

    // merge and push all new merged Blocks into mergedBlocks array
    while(count < this.mergeTimes){
      let probability = Math.random();
      let selectedIdx = Math.floor(probability * this.buildingBlocks.length);

      // if selectedIdx is "dirty" 
      if(hash.has(selectedIdx)){
        continue;
      }
      // if on the border
      if((selectedIdx%this.subdivisionX) == (this.subdivisionX-1) ||
          Math.floor(selectedIdx/this.subdivisionX) == (this.subdivisionZ-1)){
        continue;
      }


      // horizontally merge blocks
      if(probability < 0.34){
        let selectedIdx2 = selectedIdx + 1;
        
        if(hash.has(selectedIdx2)){
          continue;
        }
        
        // merge
        let mergedBlock: BuildingBlock;
        mergedBlock = {pos1: this.buildingBlocks[selectedIdx].pos1,
                       pos2: this.buildingBlocks[selectedIdx2].pos2,
                       pos3: this.buildingBlocks[selectedIdx2].pos3,
                       pos4: this.buildingBlocks[selectedIdx].pos4,
                       populationDensity: this.buildingBlocks[selectedIdx].populationDensity + this.buildingBlocks[selectedIdx2].populationDensity
                      };

        mergedBlocks.push(mergedBlock);
        
        // mark as "dirty"
        hash.add(selectedIdx);
        hash.add(selectedIdx2);
      }
      // vertically merge blocks
      else if(probability < 0.67){
        let selectedIdx2 = selectedIdx + this.subdivisionX;
        
        if(hash.has(selectedIdx2)){
          continue;
        }
        
        // merge
        let mergedBlock: BuildingBlock;
        mergedBlock = {pos1: this.buildingBlocks[selectedIdx].pos1,
                       pos2: this.buildingBlocks[selectedIdx].pos2,
                       pos3: this.buildingBlocks[selectedIdx2].pos3,
                       pos4: this.buildingBlocks[selectedIdx2].pos4,
                       populationDensity: this.buildingBlocks[selectedIdx].populationDensity + this.buildingBlocks[selectedIdx2].populationDensity
                      };

        mergedBlocks.push(mergedBlock);
        
        // mark as "dirty"
        hash.add(selectedIdx);
        hash.add(selectedIdx2);
      }
      // merge both horizontally and vertically
      else{
        let selectedIdx2 = selectedIdx + 1;
        let selectedIdx3 = selectedIdx + this.subdivisionX + 1;
        let selectedIdx4 = selectedIdx + this.subdivisionX;
        

        if(hash.has(selectedIdx2) || hash.has(selectedIdx3) || hash.has(selectedIdx4)){
          continue;
        }
        
        // merge
        let mergedBlock: BuildingBlock;
        mergedBlock = {pos1: this.buildingBlocks[selectedIdx].pos1,
                       pos2: this.buildingBlocks[selectedIdx2].pos2,
                       pos3: this.buildingBlocks[selectedIdx3].pos3,
                       pos4: this.buildingBlocks[selectedIdx4].pos4,
                       populationDensity: this.buildingBlocks[selectedIdx].populationDensity + this.buildingBlocks[selectedIdx2].populationDensity
                      };

        mergedBlocks.push(mergedBlock);
        
        // mark as "dirty"
        hash.add(selectedIdx);
        hash.add(selectedIdx2);
        hash.add(selectedIdx3);
        hash.add(selectedIdx4);
      }

      count += 1;
    }

    //let areaThreshold = 200.0;

    // dump blocks from origin blocks to new merged ones
    for(let i = 0; i < this.buildingBlocks.length; i++){
      // if this block has been merged, skip it
      if(hash.has(i)){
        continue;
      }

      // TODO : check size and remove small blocks
      // if(this.removeSmallBlocks(areaThreshold, this.buildingBlocks[i])){
      //   continue;
      // }

      mergedBlocks.push(this.buildingBlocks[i]);
    }

    // reset building blocks
    this.buildingBlocks = mergedBlocks;
  }

  removeSmallBlocks(threshold: number, block: BuildingBlock): boolean{
      if(Math.abs(block.pos1[0] - block.pos3[0]) * Math.abs(block.pos1[2] - block.pos3[2]) < threshold){
        return true;
      }
      return false;
  }

  getBuildingBlocks(): Array<BuildingBlock>{
    return this.buildingBlocks;
  }

  create() {
    
    // generate blocks
    this.genBuildingBlocks();

    // ranomly merge blocks
    this.mergeBlocks();

    // generate VBOs based on blocks
    let blockSize = this.buildingBlocks.length;

    var indices: number[] = [];
    var nor: number[] = [];
    var pos: number[] = [];

    let indexCount = 0;

    for(let i = 0; i < blockSize; i++){
      // first triangle
      indices.push(indexCount);
      indices.push(indexCount + 1);
      indices.push(indexCount + 2);

      // second triangle
      indices.push(indexCount);
      indices.push(indexCount + 2);
      indices.push(indexCount + 3);
      
      // push normal
      for(let j = 0; j < 4; j++){
        nor.push(0.0);
        nor.push(0.0);
        nor.push(1.0);
        nor.push(0.0);
      }
      
      // push position
      pos.push(this.buildingBlocks[i].pos1[0]);
      pos.push(this.buildingBlocks[i].pos1[1]);
      pos.push(this.buildingBlocks[i].pos1[2]);
      pos.push(1.0);
      
      pos.push(this.buildingBlocks[i].pos2[0]);
      pos.push(this.buildingBlocks[i].pos2[1]);
      pos.push(this.buildingBlocks[i].pos2[2]);
      pos.push(1.0);

      pos.push(this.buildingBlocks[i].pos3[0]);
      pos.push(this.buildingBlocks[i].pos3[1]);
      pos.push(this.buildingBlocks[i].pos3[2]);
      pos.push(1.0);

      pos.push(this.buildingBlocks[i].pos4[0]);
      pos.push(this.buildingBlocks[i].pos4[1]);
      pos.push(this.buildingBlocks[i].pos4[2]);
      pos.push(1.0);
     

      indexCount += 4;
    }


    this.indices = new Uint32Array(indices);
    this.normals = new Float32Array(nor);
    this.positions = new Float32Array(pos);

    this.generateIdx();
    this.generatePos();
    this.generateNor();

    this.count = this.indices.length;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNor);
    gl.bufferData(gl.ARRAY_BUFFER, this.normals, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);

    console.log(`Created BuildBase`);
  }
};

export default BuildingBase;
