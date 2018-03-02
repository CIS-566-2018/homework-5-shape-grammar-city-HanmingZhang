#version 300 es

uniform mat4 u_Model;      

uniform mat4 u_lightViewProj;   

in vec4 vs_Pos;             


void main()
{
    gl_Position = u_lightViewProj * u_Model * vs_Pos;
    // gl_Position = u_lightViewProj * vs_Pos;
}
