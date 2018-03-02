#version 300 es
precision highp float;

uniform sampler2D u_depthColorTexture; // shadow map

in vec2 fs_UV;

out vec4 out_Col; 


void main()
{
      out_Col = texture(u_depthColorTexture, fs_UV);
}
