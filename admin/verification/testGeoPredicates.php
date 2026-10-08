<?php
// Run: php admin/verification/testGeoPredicates.php <database>
// All fixture writes are confined to connection-local temporary tables.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$databaseName = $argv[1] ?? '';
if (!preg_match('/^[A-Za-z0-9_]+$/', $databaseName)) {
    fwrite(STDERR, "Usage: php testGeoPredicates.php <database>\n");
    exit(1);
}
$root = dirname(__DIR__, 2);
$argv = [$root.'/index.php'];
require $root.'/autoload.php';
use Heurist\Database\MysqlDatabase;
use Heurist\Records\Query\Compiler\FieldPredicateCompiler;
use Heurist\Records\Query\Compiler\SqlBuildContext;
$pdo = new PDO('mysql:host='.HEURIST_DBSERVER_NAME.';port='.intval(HEURIST_DB_PORT ?: 3306).';dbname='.HEURIST_DB_PREFIX.$databaseName.';charset=utf8mb4',ADMIN_DBUSERNAME,ADMIN_DBUSERPSWD,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
// Connection-local fixture tables shadow production names; no persistent writes.
$pdo->exec('CREATE TEMPORARY TABLE defDetailTypes (dty_ID INT PRIMARY KEY,dty_Type VARCHAR(30), INDEX(dty_Type))');
$pdo->exec('CREATE TEMPORARY TABLE Records (rec_ID INT PRIMARY KEY,rec_RecTypeID INT,rec_OwnerUGrpID INT)');
$pdo->exec('CREATE TEMPORARY TABLE recDetails (dtl_ID INT PRIMARY KEY,dtl_RecID INT,dtl_DetailTypeID INT,dtl_Geo GEOMETRY NULL,dtl_HideFromPublic INT DEFAULT 0,INDEX(dtl_DetailTypeID),INDEX(dtl_RecID))');
$pdo->exec('CREATE TEMPORARY TABLE defRecStructure (rst_RecTypeID INT,rst_DetailTypeID INT,rst_RequirementType VARCHAR(30),rst_NonOwnerVisibility VARCHAR(30))');
$pdo->exec("INSERT INTO defDetailTypes VALUES (28,'geo'),(29,'geo'),(30,'freetext')");
$pdo->exec('INSERT INTO Records VALUES (1,10,60000),(2,10,60000),(3,10,60000),(4,10,60000),(5,11,60000),(6,12,60000),(7,10,60000),(8,13,60000),(9,10,60000)');
$pdo->exec("INSERT INTO defRecStructure VALUES (10,28,'optional','public'),(11,29,'optional','hidden'),(12,28,'forbidden','public'),(13,28,'optional','pending')");
$pdo->exec("INSERT INTO recDetails VALUES (1,1,28,ST_GeomFromText('POINT (120 0)'),0),(2,2,28,ST_GeomFromText('POINT (20 0)'),0),(3,3,28,ST_GeomFromText('POINT (130 0)'),1),(5,5,29,ST_GeomFromText('POINT (120 0)'),0),(6,6,28,ST_GeomFromText('POINT (120 0)'),0),(7,7,28,ST_GeomFromText('POINT (120 0)'),0),(8,7,28,ST_GeomFromText('POINT (140 0)'),0),(9,8,28,ST_GeomFromText('POINT (120 0)'),0),(10,9,28,ST_GeomFromText('LINESTRING (20 0, 120 0)'),0)");
$db=new MysqlDatabase($pdo);$compiler=new FieldPredicateCompiler($db);
$extent=['west'=>100,'south'=>-70,'east'=>170,'north'=>15];
$cases=[
 ['', $extent,['isDbOwner'=>true],[1,3,5,6,7,8,9]],
 ['', $extent,['userId'=>0],[1,7,8,9]],
 ['', $extent,['userId'=>60001,'groupIds'=>[60001]],[1,3,7,8,9]],
 ['', $extent,['userId'=>60000,'groupIds'=>[60000]],[1,3,5,7,8,9]],
 ['28', $extent,['isDbOwner'=>true],[1,3,6,7,8,9]],
 ['within', $extent,['isDbOwner'=>true],[1,3,5,6,7,8]],
 ['', 'NULL',['isDbOwner'=>true],[4]],
 ['', '-NULL',['isDbOwner'=>true],[1,2,3,5,6,7,8,9]]
];
foreach($cases as [$suffix,$value,$context,$expected]){
 $state=new SqlBuildContext($context);$condition=$compiler->geoCondition($suffix,$value,$state);
 $ids=array_map('intval',$db->fetchColumn('SELECT r.rec_ID FROM Records r WHERE '.$condition.' ORDER BY r.rec_ID',$state->values()));
 if($ids!==$expected)throw new RuntimeException('Unexpected geo match set: '.json_encode($ids));
}
echo "Geo predicates: extents, multiple fields, within/intersects, NULL, hidden/forbidden fields, anonymous and owner visibility passed against temporary MySQL fixtures.\n";
