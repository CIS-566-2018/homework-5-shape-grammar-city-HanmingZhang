import * as OBJLoader from 'obj-mtl-loader';

let tmp_vertices: number[][];
let tmp_normals: number[][];
let tmp_faces_indices: number[][];
let tmp_faces_normals: number[][];

class Object {
    vertices: number[][];
    faces_indices: number[][];
    faces_normals: number[][];
    normals: number[][];
    name: string;

    constructor(_name: string){
        this.vertices = [];
        this.faces_indices = [];
        this.faces_normals = [];
        this.normals = [];

        this.name = _name;
    }

    create(filePath: string, callback: any){
        var objMtlLoader = new OBJLoader();

        tmp_vertices = this.vertices;
        tmp_normals = this.normals;
        tmp_faces_indices = this.faces_indices;
        tmp_faces_normals = this.faces_normals;

        objMtlLoader.load(filePath, function(err : any, result: any) {
            if(err){
                console.log("Obj Loader Error");
            }

            // push positions
            for(let i = 0; i < result.vertices.length; i++){
                let tmp = [];
                tmp.push(result.vertices[i][0]);
                tmp.push(result.vertices[i][1]);
                tmp.push(result.vertices[i][2]);
                tmp_vertices.push(tmp);
            }

            // push normals
            for(let i = 0; i < result.normals.length; i++){
                let tmp = [];
                tmp.push(result.normals[i][0]);
                tmp.push(result.normals[i][1]);
                tmp.push(result.normals[i][2]);
                tmp_normals.push(tmp);
            }

            // push face indices
            for(let i = 0; i < result.faces.length; i++){
                let tmp1 = [];
                tmp1.push(result.faces[i].indices[0]);
                tmp1.push(result.faces[i].indices[1]);
                tmp1.push(result.faces[i].indices[2]);
                tmp_faces_indices.push(tmp1);

                let tmp2 = [];
                tmp2.push(result.faces[i].normal[0]);
                tmp2.push(result.faces[i].normal[1]);
                tmp2.push(result.faces[i].normal[2]);
                tmp_faces_normals.push(tmp2);
            }

            // run call back after finishing loading
            if(callback != null){
                callback();
            }

        });
    }
};

export default Object;