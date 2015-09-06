var sphereGeom = new THREE.SphereGeometry(1, 32, 32);
//materials
var phongMaterial = new THREE.MeshPhongMaterial({
    color: 0x22bbff
});
sphereMesh = new THREE.Mesh(sphereGeom, phongMaterial);
sphereMesh.position.set(0,0,0);

scene.add(sphereMesh);









// debug sphere
var sphereGeom = new THREE.SphereGeometry(1, 10, 10);
var material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
var sphereMesh = new THREE.Mesh(sphereGeom, material);
intersectables.push(sphereMesh);
scene.add(sphereMesh);



//enable smooth shading
// mesh.geometry.computeVertexNormals();
// mesh.geometry.computeCentroids();
// mesh.geometry.computeFaceNormals();
// mesh.geometry.mergeVertices();




var objLoader = new THREE.OBJLoader();
var mtlLoader = new THREE.MTLLoader();
var babylonLoader = new THREE.BabylonLoader();
var jsonLoader = new THREE.JSONLoader();