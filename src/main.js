var uiManager = (function(){
    var canvas;
    var camera;
    var uiContainer;
    var panes = [];
    /* pane
    {
        tracker:Object3D
        el:Element
    }
    */

    function init(_canvas, _camera){
        canvas = _canvas;
        camera = _camera;

        uiContainer = document.createElement('div');
        uiContainer.style.position = 'absolute';
        uiContainer.style.left = 0+'px';
        uiContainer.style.top = 0+'px';
        insertAfter(uiContainer, canvas);

        //replace undo keys string for windows
        if(!isMac){
            document.querySelector('#undo-cmd-str').innerHTML = "CTRL-Z";
        }
    }

    function update(){
        for(var i = 0; i < panes.length; i++){
            var pane = panes[i];
            updatePane(pane);
        }   
    }

    function updatePane(pane){
        var pos2D = worldToScreen(pane.tracker.position);
        var xOffset = 8;

        var side = 'left';
        if(getParameterByName('q').toLowerCase().trim() === 'composite'){//@!diiiiiirty hack
            side = 'right';
        }

        switch (side.toLowerCase()){
            case 'left':
                pane.el.style.left = pos2D.x - pane.el.clientWidth - xOffset +'px';
                pane.el.style.top = pos2D.y - pane.el.clientHeight*.5+'px';
            break;
            case 'right':
                pane.el.style.left = pos2D.x +'px';
                pane.el.style.top = pos2D.y - pane.el.clientHeight*.5+'px';
            break;
        }

        //rough depth ordering with z-index and camera
        //janky but works
        var maxZ = 10000;
        var minZ = 100;
        pane.el.style.zIndex = maxZ - Math.min(Math.round(viewDepth(pane.tracker.position)*10), maxZ - minZ);
    }

    function attachAnnotation(trackObject3D, message, width, editable){
        width = width || 250;
        editable = typeof editable !== 'undefined' ? editable : false;
        var pane = {
            tracker: trackObject3D,
            el: document.createElement('div')
        }

        pane.el.classList.add('uilayer');
        pane.el.classList.add('annotation');

        pane.el.style.position = 'absolute';
        pane.el.style.width = width+'px';
        if(editable === true){
            pane.el.contentEditable = editable;
            pane.el.classList.add('placeholder');
            pane.el.addEventListener('mouseup', function(){
                pane.el.focus();
            });

            pane.el.addEventListener('focus', function(){
                if(pane.el.classList.contains('placeholder')){
                    pane.el.innerHTML = "";
                }
                pane.el.classList.remove('placeholder');
            });
        }
        
        pane.el.style.display = 'block';
        pane.el.innerHTML = message;

        //position
        updatePane(pane);

        uiContainer.appendChild(pane.el);

        panes.push(pane);
        return pane;
    }

    function setQuestion(state){
        var q = getParameterByName('q');
        var pq = getParameterByName('pq');

        function moveForward(){
            moveTo(state.next);
        }

        function moveBackward(){
            window.location.href = '?q='+(state.previous || pq)+'&pq='+q+'&state={}';
        }

        function moveTo(question){
            window.location.href = '?q='+question+'&pq='+q+'&state={}';
        }

        //set back/forward links
        var backEl = document.querySelector('.side-bar button.back');
        var forwardEl = document.querySelector('.side-bar button.forward');

        if(state.previous || pq){
            backEl.addEventListener('click', moveBackward);            
        }else{
            backEl.classList.add('disabled');
        }

        if(state.next){
            forwardEl.addEventListener('click', moveForward);            
        }else{
            forwardEl.classList.add('disabled');
        }

        //answer button
        var sendEl = document.querySelector('.side-bar button.submit');
        if(state.type.match('answers')){
            sendEl.style.display = 'none';
        }else{
            sendEl.style.display = '';
            //send answer button click
            if(state.next){
                sendEl.addEventListener('click', function(){
                    moveTo(state.submitTo || state.next);
                });
            }
        }

        //fill question elements
        var questionEl = document.querySelector('.question-panel');

        questionEl.querySelector('.title').innerHTML = state.title;
        questionEl.querySelector('.info').innerHTML = state.info;

        questionEl.querySelector('.icon').style.display = 'none';
        switch(state.type){
            case "poll":
            break;
            case "draw":
                questionEl.querySelector('.icon img').src = 'images/drawicon.png';
                questionEl.querySelector('.icon').style.display = '';
            break;
            case "label":
                questionEl.querySelector('.icon img').src = 'images/labelicon.png';
                questionEl.querySelector('.icon').style.display = '';
            break;
            default:
            break;
        }
    }

    //private
    function insertAfter(newNode, referenceNode) {
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    }

    function worldToScreen(pos3D){
        var proj = pos3D.clone().project(camera);
        var pos2D = new THREE.Vector2(
            Math.round(  (proj.x + 1) * canvas.clientWidth / 2 ),
            Math.round(  (-proj.y + 1) * canvas.clientHeight / 2 )
        );
    
        return pos2D;
    }

    function viewDepth(pos3D){
        //get camera vector
        var camVector = (new THREE.Vector3(0, 0, -1)).applyQuaternion(camera.quaternion);
        //estimate by distance for now
        return pos3D.distanceTo(camera.position);
    }

    return {
        init: init,
        attachAnnotation: attachAnnotation,
        update: update,
        setQuestion: setQuestion
    }
})();


var app = (function(){
    //enums
    var INTERACTION_MODE = {
        orbit: 0,
        draw: 1,
        annotate: 2,
        fixed: 3
    }
    //app state
    var _interactionMode;
    var mouseDown = false;
    var shiftDown = false;
    var altDown = false;
    var ctrlDown = false;
    var cmdDown = false;
    var line3DColor = 0x0000FF;
    var line3DThickness = 0.1;
    var line3DOpacity = 1.0;
    //typedef LinePart = {point:Vector3, objects:Array<Object3D>};
    var lines = [];//:Array<Array<LinePart>>
    var currentLine = null;//:LinePart
    var questionType = null;

    //dom
    var container;

    //core 3d
    var camera;
    var controls;
    var scene;
    var renderer;
    var raycaster;

    //interaction
    var clipSpaceMouse;
    var mouse3D;

    //scene
    var gridHelper;
    var intersectables = [];

    //cached objects
    var lowResSphereGeom = new THREE.SphereGeometry(1, 8, 8);
    var redPhong = new THREE.MeshPhongMaterial({color: 0xff0000});
    var debugMaterial = new THREE.MeshBasicMaterial({color: 'yellow', side: THREE.DoubleSide});

    function init(_container){
        container = _container || document.body;

        //setup
        renderer = new THREE.WebGLRenderer({
            antialias: true
        });

        renderer.setClearColor(0xD0D0D0, 1);

        renderer.setSize(width(), height());
        renderer.setPixelRatio(window.devicePixelRatio);

        camera = new THREE.PerspectiveCamera(60, width() / height(), 0.01, 1000);
        camera.position.set(0,4,18);

        //interaction
        controls = new THREE.OrbitControls(camera, container);
        controls.zoomSpeed = 0.5;
        controls.noKeys = true;

        clipSpaceMouse = new THREE.Vector2();
        mouse3D = new THREE.Vector3();

        raycaster = new THREE.Raycaster(camera.position, mouse3D);

        //scene
        scene = new THREE.Scene();

        var size = 10;
        var step = 1;
        gridHelper = new THREE.GridHelper(size, step);
        gridHelper.setColors(0x505050, 0x909090);
        gridHelper.material.transparent = true;
        gridHelper.material.opacity = 0.3;

        scene.add(gridHelper);

        //plain white
        var light = new THREE.DirectionalLight(0xffffff, 1.0);
        light.position.set(1, 1, 1);
        scene.add(light);

        //add to dom
        container.appendChild(renderer.domElement);

        //initialize ui manager
        uiManager.init(renderer.domElement, camera);

        setInteractionMode(INTERACTION_MODE.orbit);

        //dom events
        window.addEventListener('resize', onWindowResize, false);
        renderer.domElement.addEventListener('mouseup', onMouseUp, false);
        renderer.domElement.addEventListener('mousedown', onMouseDown, false);
        renderer.domElement.addEventListener('mousemove', onMouseMove, false);
        renderer.domElement.addEventListener('mouseleave', onMouseLeave, false);
        document.addEventListener('keyup', onKeyUp, false);
        document.addEventListener('keydown', onKeyDown, false);

        //kick off display loop
        requestAnimationFrame(render);
    }

    function setState(state){
        uiManager.setQuestion(state);

        //state variables
        line3DColor = state.lineColor || line3DColor;
        line3DThickness = state.lineThickness || line3DThickness;

        //interaction mode
        switch(state.type){
            case "poll":
                setInteractionMode(INTERACTION_MODE.orbit);
            break;
            case "label":
                setInteractionMode(INTERACTION_MODE.orbit);
            break;
            case "draw":
                setInteractionMode(INTERACTION_MODE.draw);
            break;
            default:
                setInteractionMode(INTERACTION_MODE.orbit);
            break;
        }

        questionType = state.type;

        //load models
        for(var i = 0; i < state.models.length; i++){
            var m = state.models[i];

            var fileReg = /[^\\]*\.(\w+)$/;
            var fileMatched = m.url.match(fileReg);
            var filename = fileMatched[0];
            var extension = fileMatched[1];

            var loader;

            function defaultLoad(){
                loader.load(m.url, makeModelHandler(
                    new THREE.Vector3(m.translation[0], m.translation[1], m.translation[2]),
                    new THREE.Vector3(m.rotation[0], m.rotation[1], m.rotation[2]),
                    m.scale,
                    m.color
                ));
            }

            switch(extension.toLowerCase()){
                case 'stl':
                    loader = new THREE.STLLoader();
                    defaultLoad();
                break;
                case 'obj':
                    if(m.mtl){
                        loader = new THREE.OBJMTLLoader(); 
                        loader.load(m.url, m.mtl, makeModelHandler(
                            new THREE.Vector3(m.translation[0], m.translation[1], m.translation[2]),
                            new THREE.Vector3(m.rotation[0], m.rotation[1], m.rotation[2]),
                            m.scale,
                            m.color
                        ));
                    }else{
                        loader = new THREE.OBJLoader(); 
                        defaultLoad();
                    }
                break;
                case 'json':
                    loader = new THREE.ObjectLoader();
                    defaultLoad()
                break;
            }
        }

        //add annotations
        if(state.annotations){
            for(var i = 0; i < state.annotations.length; i++){
                var a = state.annotations[i];
                var annote = annotate3D(new THREE.Vector3(a.point[0], a.point[1], a.point[2]), a.text, a.width, a.editable);

                //fix interaction on edit
                //save restore interaction mode
                var _savedInteractionMode = getInteractionMode();
                annote.pane.el.addEventListener('focus', function(){
                    _savedInteractionMode = getInteractionMode();
                    setInteractionMode(INTERACTION_MODE.fixed);
                });
                annote.pane.el.addEventListener('blur', function(){
                    setInteractionMode(_savedInteractionMode);
                });
            }
        }

        //add lines

        //cycle color with each line, @! hack
        var cLineColor = new Color('#FF0000');
        if(state.lines){//array of arrays of Vec3
            for(var i = 0; i < state.lines.length; i++){
                var l = state.lines[i];
                //iterate line points
                if(!l.points[0]) continue;
                line3DColor = cLineColor.toCSSHex();
                line3DOpacity = 0.7;//l.opacity; //@! hack
                line3DThickness = 0.03;//l.thickness;//@! hack
                var p;
                p = new THREE.Vector3(-l.points[0][0], l.points[0][1], l.points[0][2]);//@! hack: flipped on x
                lineMoveTo3D(p);
                for(var j = 1; j < l.points.length; j++){
                    p = new THREE.Vector3(-l.points[j][0], l.points[j][1], l.points[j][2]);//@! hack: flipped on x
                    lineLineTo3D(p);
                }

                //cycle line color @! hack
                cLineColor = cLineColor.shiftHue(30);
            }
        }

        //camera
        camera.position.set(state.cameraPos[0], state.cameraPos[1], state.cameraPos[2]);
        camera.lookAt(new THREE.Vector3(state.cameraTarget[0], state.cameraTarget[1], state.cameraTarget[2]));

        //lighting
        switch(state.lightingMode){
            case 1:
            //backlight
            var light = new THREE.DirectionalLight(7838134, 0.5);
            light.matrix.set([-0.11775875091552734, -0.5954218506813049, 0.7947362661361694, 0, 0.7947362065315247, 0.4233497679233551, 0.43493524193763733, 0, -0.5954217910766602, 0.6828232407569885, 0.42335018515586853, 0, -53.34980010986328, 61.180999755859375, 37.93220138549805, 1]);
            scene.add(light);

            //filllight
            // var light = new THREE.DirectionalLight(15062196, 0.55);
            // light.matrix.set([0.3981269598007202, 0.7758041620254517, -0.48951172828674316, 0, -0.48951178789138794, 0.630973219871521, 0.6018729209899902, 0, 0.7758042812347412, -7.781910937865177e-8, 0.630972683429718, 0, 133.55799865722656, 0, 108.625, 1]);
            // scene.add(light);
            break;
        }
    }

    var _startTime = Date.now();
    var _lastInteractionMode = getInteractionMode();
    function render(){
        var time = (Date.now() - _startTime)/1000;

        //set cursor
        if(_lastInteractionMode !== getInteractionMode()){//update cursor on change
            renderer.domElement.style.cursor = 'default';
            switch(getInteractionMode()){
                case INTERACTION_MODE.orbit:
                    renderer.domElement.style.cursor = 'move';
                break;
                case INTERACTION_MODE.draw:
                break;
                case INTERACTION_MODE.annotate:
                break;
                case INTERACTION_MODE.fixed:
                break;
            }
            _lastInteractionMode = getInteractionMode();
        }

        //update controls
        switch(getInteractionMode()){
            case INTERACTION_MODE.draw:
            case INTERACTION_MODE.fixed:
                controls.enabled = false;
            break;
            default:
                controls.enabled = true;
            break;
        }

        renderer.render(scene, camera);

        uiManager.update();

        requestAnimationFrame(render);
    }

    function makeModelHandler(translation, rotation, scale, color){
        translation = translation || new THREE.Vector3(0);
        rotation = rotation || new THREE.Vector3(0);
        scale = scale || 1;

        var replaceMaterial = !!color;
        color = color || 0xEEEEEE;

        return function(obj){
            
            var mesh;

            var objType = obj.type.toLowerCase();
            geomMode = objType == "geometry" || objType == "buffergeometry";

            trace('loaded', obj, geomMode);

            var material = new THREE.MeshPhongMaterial({
                color: color,
                specular: 0x111111,
                shininess: 200
            });

            if(geomMode){
                //STL-like formats
                var geometry = obj;
                mesh = new THREE.Mesh(geometry, material);

                mesh.material = material;
            }else{
                mesh = obj;
                if(replaceMaterial){
                    mesh.material = material;
                    for(var i = 0; i < mesh.children.length; i++){
                        var c = mesh.children[i];
                        c.material = material;
                    }                    
                }
            }

            var transform;
            //rotation X
            transform = (new THREE.Matrix4()).makeRotationX(rotation.x);
            //rotation Y
            transform = (new THREE.Matrix4()).makeRotationY(rotation.y).multiply(transform);
            //rotation Z
            transform = (new THREE.Matrix4()).makeRotationZ(rotation.z).multiply(transform);
            //scale
            transform = (new THREE.Matrix4()).makeScale(scale, scale, scale).multiply(transform);
            //translate
            transform = (new THREE.Matrix4()).makeTranslation(translation.x, translation.y, translation.z).multiply(transform);
            mesh.applyMatrix(transform);

            // mesh.castShadow = true;
            // mesh.receiveShadow = true;

            scene.add(mesh);
            intersectables.push(mesh);

            window.mesh = mesh;//@! debug
        }
    }

    function intersect(ex, ey){
        //clip-space mouse
        clipSpaceMouse.set(ex*2/width() - 1, -(ey*2/height() - 1));

        raycaster.setFromCamera(clipSpaceMouse, camera);

        //calculate objects intersecting the picking ray
        var intersects = raycaster.intersectObjects(intersectables, true);

        if(!intersects)
            return null;

        var primary = intersects[0];

        if(!primary)
            return null;

        return primary.point;
    }

    function simpleMarker3D(pos3D, color, size, basic, opacity){
        size = size || 0.15;
        color = color || 0xFF0000;
        opacity = opacity || 1;
        basic = typeof basic !== 'undefined' ? basic : false;
        //create test pin at point
        var material
        if(basic){
            material = new THREE.MeshBasicMaterial({color: color});
        }else{
            material = new THREE.MeshPhongMaterial({color: color});
        }
        material.transparent = opacity < 1;
        material.opacity = opacity;
        var pinMesh = new THREE.Mesh(lowResSphereGeom, material);

        pinMesh.scale.set(size, size, size);
        pinMesh.position.set(pos3D.x,pos3D.y,pos3D.z);

        scene.add(pinMesh);
        return pinMesh;
    }

    function annotate3D(pos3D, text, width, editable){
        var marker = simpleMarker3D(pos3D, 0xFF0000,  0.15, true);
        trace(pos3D);
        return {
            pane: uiManager.attachAnnotation(marker, text, width, editable),
            marker: marker
        }
    }

    function lineMoveTo3D(pos3D){
        var color = line3DColor || 0x0000FF;
        var thickness = line3DThickness || 0.025;
        var opacity = line3DOpacity || 1;

        var marker = simpleMarker3D(pos3D, color, thickness, false, opacity);

        currentLine = [];
        currentLine.push({
            point: pos3D.clone(),
            objects: [marker]
        })
        lines.push(currentLine);
    }

    function lineLineTo3D(pos3D){
        var color = line3DColor || 0x0000FF;
        var thickness = line3DThickness || 0.025;
        var opacity = line3DOpacity || 1;

        var segments = 5;
        //draw line from lastPoint in currentLine to pos3D
        if(!currentLine) return;

        var lastPoint = currentLine[currentLine.length - 1].point;
        var len = pos3D.distanceTo(lastPoint);

        var geometry = new THREE.CylinderGeometry(thickness, thickness, len, segments);
        //shift center of rotation
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, len*.5, 0));
        // var material = new THREE.MeshBasicMaterial({color: color});
        var material = new THREE.MeshPhongMaterial({
            color: color,
            transparent: opacity < 1,
            opacity: opacity
        });
        line = new THREE.Mesh(geometry, material);

        //align with points
        //set start pos
        line.position.set(lastPoint.x, lastPoint.y, lastPoint.z);
        //point at pos3D
        var cylDir = new THREE.Vector3(0, 1, 0);
        var dir = (new THREE.Vector3()).subVectors(pos3D, lastPoint).normalize();
        //quart method
        var quaternion = new THREE.Quaternion().setFromUnitVectors(cylDir, dir);
        line.setRotationFromQuaternion(quaternion);

        scene.add(line);

        //add end marker
        var marker = simpleMarker3D(pos3D, color, thickness*0.95, false, opacity);

        //add line part to current line
        currentLine.push({
            point: pos3D.clone(),
            objects: [line, marker]
        })
    }

    //@! temporary design
    function exportLines(){
        var str = '';
        for(var i = 0; i < lines.length; i++){
            var l = lines[i];

            str += '{"color":"#00FF00", "opacity":0.3, "thickness":0.025, "points":[';
            for(var j = 0; j < l.length; j++){
                var part = l[j];
                var p = part.point;
                str += '['+p.x+','+p.y+','+p.z+']';

                if(j+1 < l.length){
                    str+=',';
                }
            }
            str += ']}';
            if(i+1 < lines.length){
                str+=',\n';
            }
        }


        return str;
    }

    //event handling
    function onUndo(){
        //undo by interaction mode, not perfect but will work
        switch(getInteractionMode()){
            case INTERACTION_MODE.draw:
                trace('undo in interaction mode draw');
                //remove last line's part's objects
                if(lines && lines.length){
                    var lastLine = lines.pop();
                    for(var i = 0; i < lastLine.length; i++){
                        var part = lastLine[i];
                        for(var j = 0; j < part.objects.length; j++){
                            var obj = part.objects[j];
                            scene.remove(obj);
                        }
                    }
                }
            break;
        }
    }

    function onMouseDown(e){
        mouseDown = true;
        switch(getInteractionMode()){
            case INTERACTION_MODE.orbit:
            break;
            case INTERACTION_MODE.draw:
                var pos3D = intersect(e.layerX, e.layerY);
                if(pos3D){
                    lineMoveTo3D(pos3D);
                }
            break;
            case INTERACTION_MODE.annotate:
                var pos3D = intersect(e.layerX, e.layerY);
                if(pos3D){
                    annotate3D(pos3D);
                }
            break;
        }
    }

    function onMouseUp(e){
        mouseDown = false;
    }

    function onMouseMove(e){
        switch(getInteractionMode()){
            case INTERACTION_MODE.draw:
                if(mouseDown){
                    var pos3D = intersect(e.layerX, e.layerY);
                    if(pos3D){
                        lineLineTo3D(pos3D);
                    }
                }
            break;
        }

    }

    function onMouseLeave(e){
        mouseDown = false;
    }

    function onKeyUp(e){
        if(e.shiftKey === false) shiftDown = false;
        if(e.altKey === false) altDown = false;
        if(e.ctrlKey === false) ctrlDown = false;
        if(e.metaKey === false) cmdDown = false;
    }

    function onKeyDown(e){
        if(e.shiftKey === true) shiftDown = true;
        if(e.altKey === true) altDown = true;
        if(e.ctrlKey === true) ctrlDown = true;
        if(e.metaKey === true) cmdDown = true;

        //handle cmd-z and ctrl-z
        //"z".charCodeAt(0) === 
        if(e.keyCode === "Z".charCodeAt(0) && ((cmdDown && isMac) || (ctrlDown && !isMac))){
            onUndo();
        }
    }

    function onWindowResize(){
        camera.aspect = width() / height();
        camera.updateProjectionMatrix();
        renderer.setSize(width(), height());
    }

    function getInteractionMode(){
        //force rotate mode if special keys down
        if(shiftDown || altDown){
            return INTERACTION_MODE.orbit;
        }
        return _interactionMode;
    }

    function setInteractionMode(mode){
        _interactionMode = mode;
    }

    function width(){
        return container.clientWidth;
    }

    function height(){
        return container.clientHeight;
    }


    return {
        init: init,
        setState: setState,
        setInteractionMode: setInteractionMode,
        exportLines: exportLines
    };
})();

app.init(document.getElementsByClassName('viewer')[0]);

var questionName = getParameterByName('q').toLowerCase();

if(!questionName){//redirect to default
    window.location.href = '?q=highlight-circumflex';
}

loadJSON('questions/'+questionName+'.json', function(data){
    app.setState(data);
});