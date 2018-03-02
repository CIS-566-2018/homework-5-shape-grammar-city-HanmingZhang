#version 300 es

precision mediump float;

uniform vec4 u_Color; // The color with which to render this instance of geometry.

uniform sampler2D u_depthColorTexture; // shadow map

// These are the interpolated values out of the rasterizer, so you can't know
// their specific values without knowing the vertices that contributed to them
in vec4 fs_Nor;
in vec4 fs_LightVec;
in vec4 fs_Col;

in vec4 shadowPos; // shadow space position

out vec4 out_Col; // This is the final output color that you will see on your
                  // screen for the pixel that is currently being processed.

const float shadowDepthTextureSize = 2048.0; //1024.0;

// decode from shadow map
float decodeFloat (vec4 color) {
  const vec4 bitShift = vec4(
    1.0 / (256.0 * 256.0 * 256.0),
    1.0 / (256.0 * 256.0),
    1.0 / 256.0,
    1
  );
  return dot(color, bitShift);
}

void main()
{
    // Material base color (before shading)
    // vec4 diffuseColor = u_Color;
    vec4 diffuseColor = fs_Col;

    // Calculate the diffuse term for Lambert shading
    float diffuseTerm = dot(normalize(fs_Nor), normalize(fs_LightVec));
    // Avoid negative lighting values
    // diffuseTerm = clamp(diffuseTerm, 0, 1);

    float ambientTerm = 0.2;

    float lightIntensity = diffuseTerm + ambientTerm;   //Add a small float value to the color multiplier
                                                        //to simulate ambient lighting. This ensures that faces that are not
                                                        //lit by our point light are not completely black.

    // Shadow map portion
    vec3 fragmentDepth = shadowPos.xyz;
    float shadowAcneRemover = 0.000005;
    fragmentDepth.z -= shadowAcneRemover;

    float texelSize = 1.0 / shadowDepthTextureSize;
    float amountInLight = 0.0;

    // we loop through nearby fragments and find out on average how much all of them are in shadow.
    // This smooths out the edges of our shadow since with a limited resolution depth color texture some fragments at the edge
    // might sample the wrong depth and thus lead to jagged edges.
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 textCoord = vec2(fragmentDepth.x + texelSize * float(x), fragmentDepth.y + texelSize * float(y));

            vec4 fetchedCol = texture(u_depthColorTexture, textCoord);

            float texelDepth = decodeFloat(fetchedCol);

            if (fragmentDepth.z < texelDepth) {
                amountInLight += 1.0;
            }
        }
    }
    amountInLight /= 9.0;

    amountInLight = clamp(amountInLight + 0.5, 0.0, 1.0);

    vec3 col = diffuseColor.rgb * lightIntensity * amountInLight;
    
    // fog
    float fogDensity = 0.0018;
    vec3 fogColor = vec3(.9, .9, .9);
    float dist = gl_FragCoord.z / gl_FragCoord.w;

    // exponential square fall off
    float fogFactor = 1.0 / exp((dist * fogDensity) * (dist * fogDensity));
    fogFactor = clamp(fogFactor, 0.0, 1.0);

    // mix color with fog color
    col = mix(fogColor, col, fogFactor);

    // TODO: should I add the lambert term?
    // like this ?
    // out_Col = vec4(diffuseColor.rgb * lightIntensity, diffuseColor.a);

    out_Col = vec4(col, diffuseColor.a);
    //out_Col = vec4(vec3(amountInLight), diffuseColor.a);
}
