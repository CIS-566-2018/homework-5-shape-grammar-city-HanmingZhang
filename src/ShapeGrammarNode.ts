import {vec3} from 'gl-matrix';

export class ShapeGrammarNode{
    symbol: string = "";    
    geometryType: string = "";
    pos: vec3 = vec3.create();
    rot: vec3 = vec3.create();
    scale: vec3 = vec3.create();
    baseCol: vec3 = vec3.create();    // base color of the whole building
    buildingHeight: number;

    isTerminal: boolean;

    constructor(_symbol: string, _geometryType: string, _pos: vec3, _rot: vec3, _scale: vec3, _baseCol: vec3, _buildingHeight: number, _isTerminal: boolean){
        this.symbol = _symbol;
        this.geometryType = _geometryType;
        this.pos[0] = _pos[0]; this.pos[1] = _pos[1]; this.pos[2] = _pos[2];
        this.rot[0] = _rot[0]; this.rot[1] = _rot[1]; this.rot[2] = _rot[2]; 
        this.scale[0] = _scale[0]; this.scale[1] = _scale[1]; this.scale[2] = _scale[2];
        this.baseCol[0] = _baseCol[0]; this.baseCol[1] = _baseCol[1]; this.baseCol[2] = _baseCol[2];
        this.buildingHeight = _buildingHeight;

        this.isTerminal = _isTerminal;
    }

    getSymbol(): string {
        return this.symbol;
    }
};


export class ShapeGrammar{
    // rules
    productions: Map<string, Array<string>>;

    // shape grammar node set
    nodeSet: Array<ShapeGrammarNode>;
    

    constructor(){
        // initialize
        this.productions = new Map();
        this.nodeSet = [];
    }

    reset(){
        // reset node set 
        this.nodeSet = [];
    }

    // All rules should be added through this
    addProduction(line: string){
        let index;
        
        // 1. Strip whitespace
        line = line.replace(/ /g, '');
        if (line.length == 0) return;
    
        // 2. Split productions
        index = line.indexOf("->");
        if (index != -1)
        {
            let symFrom = line.substr(0, index);
            let symTo = line.substr(index+2);

            // if it's empty, initialize it
            if(!this.productions.has(symFrom)){
                this.productions.set(symFrom, []);                
            }

            this.productions.get(symFrom).push(symTo);
        }
        else  // report error
        {
            console.log("input producation grammar is not correct!");
        }
    }

    // generate a successor shape grammar node base on
    // parent node and new Symbol
    generateSuccessor(parent:ShapeGrammarNode, newSymbol: string): Array<ShapeGrammarNode>{
        let successors: Array<ShapeGrammarNode> = [];
        let len = newSymbol.length;

        // // Some possibility to leave it as cube
        // if(Math.random() < 0.2){
        //     let newNode = new ShapeGrammarNode(parent.symbol, parent.geometryType, parent.pos, parent.rot, parent.scale, parent.baseCol, parent.buildingHeight, parent.isTerminal);
        //     successors.push(newNode);
        //     return successors;
        // }


        for(let i = 0; i < len; i++){
            let symbol = newSymbol.substr(i, 1); // record symbol
            
            let geometryType = parent.geometryType; // should based on its parent node and symbol
            let pos = vec3.fromValues(parent.pos[0], parent.pos[1], parent.pos[2]); // should based on its parent node and symbol
            let rot = vec3.fromValues(parent.rot[0], parent.rot[1], parent.rot[2]); // should based on its parent node and symbol
            let scale = vec3.fromValues(parent.scale[0], parent.scale[1], parent.scale[2]); // should based on its parent node and symbol
            let isTerminal = true; // should based on its parent node and symbol

            let baseCol = vec3.create(); // same as parent
            baseCol = parent.baseCol;
            let buildingHeight = parent.buildingHeight; // same as parent
            

            // change based on symbol
            // Building repeating style body
            if(symbol == "B"){
                let adjustment = len;
                if(newSymbol.charAt(len-1) == "C"){
                    adjustment = adjustment-1.0;
                }
                scale[1] = (i + 1.0) * (scale[1] / (adjustment));
                if(i != 0) {
                    scale[0] = successors[i-1].scale[0] * (0.9 + 0.035 * (adjustment-3.0)); 
                    scale[2] = successors[i-1].scale[2] * (0.9 + 0.035 * (adjustment-3.0)); 
                    // if it's a high building, we are likely to rotate it
                    if(parent.buildingHeight > 135.0 && Math.random() < 0.65){
                        rot[1] = successors[i-1].rot[1] + 0.15 * 3.1415926;
                    }
                }
            }
            // Building top
            else if(symbol == "C"){
                if(Math.random() < 0.5){
                    // Scale
                    scale[0] = 2.0 + Math.random();
                    scale[2] = 1.5 + Math.random();
                    scale[1] = 0.5 + 2.0 * Math.random();

                    // Move to top
                    pos[1] += parent.buildingHeight;

                    // Set type
                    geometryType = "TopCube";
                }
                else{
                    // Scale
                    let tmp = (0.95 - 0.15 * Math.random());
                    scale[0] = successors[i-1].scale[0] * tmp; // shrink a little
                    scale[2] = successors[i-1].scale[2] * tmp;
                    scale[1] = 10.0 + 15.0 * Math.random(); 
                    
                    // Move to top
                    pos[1] += parent.buildingHeight;
                    
                    // Set type
                    geometryType = "Pyramid";
                }
            }
            // low building repeating style
            else if(symbol == "G"){
                if(i == 0){
                    let newNode = new ShapeGrammarNode(parent.symbol, parent.geometryType, parent.pos, parent.rot, parent.scale, parent.baseCol, parent.buildingHeight, parent.isTerminal);
                    successors.push(newNode);
                }

                scale[0] = 4.0;
                scale[1] = 0.1 * parent.buildingHeight / len;
                scale[2] = 4.0;
                // Move up a little
                pos[1] += i * parent.buildingHeight / len;

                // Set type
                geometryType = "CubeRepeat";
            }


            let newNode = new ShapeGrammarNode(symbol, geometryType, pos, rot, scale, baseCol, buildingHeight, isTerminal);
            successors.push(newNode);
        }

        return successors;
    }

    // parseShapeGrammar and return 
    // the result shape grammar node array
    parseShapeGrammar(iterations: number): Array<ShapeGrammarNode>{

        // For each iteration
        // for(let i = 0; i < iterations; i++){
            // temp set stores the result after this iteration
            let tmpSet: Array<ShapeGrammarNode> = [];

            // loop over each node
            for(let j = 0; j < this.nodeSet.length; j++){
                // if not terminal, we process this node
                if(!this.nodeSet[j].isTerminal){
                    // get symbol of this node
                    let thisNodeSymbol = this.nodeSet[j].getSymbol();

                    // if this symbol has related rule
                    if(this.productions.has(thisNodeSymbol)){
                        // randomly select a rule
                        var selectedIdx = Math.floor(this.productions.get(thisNodeSymbol).length * Math.random());
                        // get child's symbol
                        var nextSymbol = this.productions.get(thisNodeSymbol)[selectedIdx];
                        // generate new node based on this node and new symbol
                        var successors = [];
                        successors = this.generateSuccessor(this.nodeSet[j], nextSymbol);

                        tmpSet = tmpSet.concat(successors);
                    }
                    // else this node's symbol doesn't has a rule
                    else{
                        tmpSet.push(this.nodeSet[j]);
                    }
                }
                // else this node is terminal
                else{
                    tmpSet.push(this.nodeSet[j]);
                }
            }

            // reset current node set
            this.nodeSet = tmpSet;
        // }
        
        return this.nodeSet;
    }

};