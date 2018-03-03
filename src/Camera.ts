import * as CameraControls from '3d-view-controls';
import {vec3, mat4} from 'gl-matrix';


function lerpCamPos(startPos: vec3, endPos: vec3, t: number): vec3{
  var resultPos = vec3.create();

  resultPos[0] = (1.0 - t) * startPos[0] + t * endPos[0];
  resultPos[1] = (1.0 - t) * startPos[1] + t * endPos[1];
  resultPos[2] = (1.0 - t) * startPos[2] + t * endPos[2];

  return resultPos;
}


class Camera {
  controls: any;
  projectionMatrix: mat4 = mat4.create();
  viewMatrix: mat4 = mat4.create();
  fovy: number = 45;
  aspectRatio: number = 1;
  near: number = 0.1;
  far: number = 5000;
  position: vec3 = vec3.create();
  direction: vec3 = vec3.create();
  target: vec3 = vec3.create();
  up: vec3 = vec3.create();

  keyframePos: Array<vec3>;
  keyframeSpeed: number;
  keyframeTimePass: number;
  keyframeFrameNumber: number;
  keyframeEyePos: vec3;
  keyframeTarget: vec3;


  constructor(position: vec3, target: vec3, isAnimated: boolean = false) {
    this.controls = CameraControls(document.getElementById('canvas'), {
      eye: position,
      center: target,
    });
    vec3.add(this.target, this.position, this.direction);
    mat4.lookAt(this.viewMatrix, this.controls.eye, this.controls.center, this.controls.up);

    // if this camera is keyframe animated
    if(isAnimated){
      this.keyframePos = [];
      this.keyframeSpeed = 0.0;
      this.keyframeTimePass = 0.0;
      this.keyframeFrameNumber = 0.0;

      this.keyframeEyePos = vec3.create();
      this.keyframeTarget = vec3.create();
    }
  }

  // set up key frames of camera
  initKeyframes(keyframePos: Array<vec3>, keyframeSpeed: number){
    this.keyframePos = keyframePos;
    this.keyframeSpeed = keyframeSpeed;
    this.keyframeFrameNumber = keyframePos.length;

    this.keyframeEyePos[0] = keyframePos[0][0];
    this.keyframeEyePos[1] = keyframePos[0][1];
    this.keyframeEyePos[2] = keyframePos[0][2];

    this.keyframeTarget[0] = 0.0;
    this.keyframeTarget[1] = 0.0;
    this.keyframeTarget[2] = 0.0;
  }

  setAspectRatio(aspectRatio: number) {
    this.aspectRatio = aspectRatio;
  }

  updateProjectionMatrix() {
    mat4.perspective(this.projectionMatrix, this.fovy, this.aspectRatio, this.near, this.far);
  }

  update() {
    this.controls.tick();
    vec3.add(this.target, this.position, this.direction);
    mat4.lookAt(this.viewMatrix, this.controls.eye, this.controls.center, this.controls.up);
  }

  animate(deltaTime: number){
    // add time passed
    this.keyframeTimePass += deltaTime * this.keyframeSpeed;

    // clamp
    if(this.keyframeTimePass >= this.keyframeFrameNumber){
      this.keyframeTimePass -= this.keyframeFrameNumber;
    }

    // find start & end pos of camera
    let startPosIndex = Math.floor(this.keyframeTimePass);
    let endPosIndex   = startPosIndex + 1.0;
    if(endPosIndex >= this.keyframeFrameNumber){
      endPosIndex = 0;
    }

    // lerp
    this.keyframeEyePos = lerpCamPos(this.keyframePos[startPosIndex], this.keyframePos[endPosIndex], this.keyframeTimePass - startPosIndex);
    
    // update view matrix
    mat4.lookAt(this.viewMatrix, this.keyframeEyePos , this.keyframeTarget, vec3.fromValues(0, 1, 0)); 
  }

};

export default Camera;
