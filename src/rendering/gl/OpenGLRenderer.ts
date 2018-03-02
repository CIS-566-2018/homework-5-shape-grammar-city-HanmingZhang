import {mat4, vec4, vec3} from 'gl-matrix';
import Drawable from './Drawable';
import Camera from '../../Camera';
import {gl} from '../../globals';
import ShaderProgram from './ShaderProgram';

const shadowDepthTextureSize = 2048.0; //1024.0;


// In this file, `gl` is accessible because it is imported above
class OpenGLRenderer {

  shadowDepthTexture: WebGLTexture;
  lightViewProjMatrix: mat4;

  constructor(public canvas: HTMLCanvasElement) {
  }

  setClearColor(r: number, g: number, b: number, a: number) {
    gl.clearColor(r, g, b, a);
  }

  setSize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  clear() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  render(camera: Camera, prog: ShaderProgram, drawables: Array<Drawable>, model: mat4) {
    
    let viewProj = mat4.create();

    mat4.multiply(viewProj, camera.projectionMatrix, camera.viewMatrix);
    prog.setModelMatrix(model);
    prog.setViewProjMatrix(viewProj);

    //let color = vec4.fromValues(1, 0, 0, 1);
    //prog.setGeometryColor(color);

    if(this.shadowDepthTexture != null){
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowDepthTexture);
      prog.setShadowTexture(0);
    }

    if(this.lightViewProjMatrix != null){
      prog.setLightViewProjMatrix(this.lightViewProjMatrix);
    }

    for (let drawable of drawables) {
      prog.draw(drawable);
    }
  }


  renderShadow(lightPos: vec3, aspectRatio: number, prog: ShaderProgram, drawables: Array<Drawable>, model: mat4){

    // create shadow map buffer related stuff and bind
    var shadowFramebuffer = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);

    this.shadowDepthTexture = gl.createTexture() // this is the final shadow map render
    gl.bindTexture(gl.TEXTURE_2D, this.shadowDepthTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, shadowDepthTextureSize, shadowDepthTextureSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    
    var renderBuffer = gl.createRenderbuffer()
    gl.bindRenderbuffer(gl.RENDERBUFFER, renderBuffer)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, shadowDepthTextureSize, shadowDepthTextureSize)
    
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadowDepthTexture, 0)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderBuffer)
    
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.bindRenderbuffer(gl.RENDERBUFFER, null)


    // create light "camera"
    let lightProjectionMatrix = mat4.create();
    let orthoCamWidth = 600.0;
    let near = 0.1;
    let far = 5000.0;
    mat4.ortho(lightProjectionMatrix, -orthoCamWidth * aspectRatio, orthoCamWidth * aspectRatio, -orthoCamWidth, orthoCamWidth, near, far);

    let lightViewMatrix = mat4.create();
    mat4.lookAt(lightViewMatrix, vec3.fromValues(lightPos[0], lightPos[1], lightPos[2]), vec3.fromValues(0, 0, 0), vec3.fromValues(0, 1, 0));

    // set up uniforms
    prog.setModelMatrix(model);

    this.lightViewProjMatrix = mat4.create();
    mat4.multiply(this.lightViewProjMatrix, lightProjectionMatrix, lightViewMatrix);    
    prog.setLightViewProjMatrix(this.lightViewProjMatrix);
    
    // draw shadows to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);

    gl.viewport(0, 0, shadowDepthTextureSize, shadowDepthTextureSize)
    gl.clearColor(0, 0, 0, 1)
    gl.clearDepth(1.0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    
    console.log("shadow draw is called!");

    for (let drawable of drawables) {
      prog.draw(drawable);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
};

export default OpenGLRenderer;
