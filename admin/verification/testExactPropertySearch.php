<?php
// Run: php admin/verification/testExactPropertySearch.php <database>
// Fixture tables and copies exist only on this connection; production is untouched.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$databaseName = $argv[1] ?? '';
if (!preg_match('/^[A-Za-z0-9_]+$/', $databaseName)) {
    fwrite(STDERR, "Usage: php testExactPropertySearch.php <database>\n");
    exit(1);
}
$root = dirname(__DIR__, 2);
$argv = [$root.'/index.php'];
require $root.'/autoload.php';
use Heurist\Database\MysqlDatabase;
use Heurist\Records\Query\Compiler\FieldPredicateCompiler;
use Heurist\Records\Query\Compiler\SqlBuildContext;
use Heurist\Records\Query\Parser\RecordQueryParser;
$pdo=new PDO('mysql:host='.HEURIST_DBSERVER_NAME.';port='.intval(HEURIST_DB_PORT ?: 3306).';dbname='.HEURIST_DB_PREFIX.$databaseName.';charset=utf8mb4',ADMIN_DBUSERNAME,ADMIN_DBUSERPSWD,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TEMPORARY TABLE Records (rec_ID INT PRIMARY KEY,rec_Title TEXT,rec_RecTypeID INT)');
$pdo->exec('CREATE TEMPORARY TABLE recDetails (dtl_ID INT PRIMARY KEY,dtl_RecID INT,dtl_DetailTypeID INT,dtl_Value TEXT)');
$pdo->exec('CREATE TEMPORARY TABLE defDetailTypes (dty_ID INT PRIMARY KEY,dty_Type VARCHAR(30))');
$pdo->exec('CREATE TEMPORARY TABLE defTerms (trm_ID INT PRIMARY KEY,trm_Label TEXT,trm_Code VARCHAR(100))');
$pdo->exec('CREATE TEMPORARY TABLE recLinks (rl_SourceID INT,rl_TargetID INT,rl_DetailID INT,rl_DetailTypeID INT,rl_RelationID INT NULL)');
$pdo->exec("INSERT INTO defDetailTypes VALUES (1,'freetext'),(2,'blocktext'),(3,'integer'),(4,'resource'),(5,'enum')");
$pdo->exec("INSERT INTO Records VALUES (1,'Exact match',10),(2,'Prefix',10),(3,'Suffix',10),(4,'000123',10),(5,'Other field',10),(6,'Special symbols',10),(7,'Numeric value',10),(8,'Leading-zero variant',10),(9,'Case variant',10),(10,'Unrelated term ID',10),(11,'Exact term label',10),(12,'Exact term code',10),(13,'Term code case variant',10)");
foreach([[1,1,1,'000123'],[2,2,1,'X000123'],[3,3,1,'000123X'],[5,5,2,'000123'],[6,6,1,'A"B*\\C'],[7,7,3,'123'],[8,8,1,'00123'],[9,9,1,'a"b*\\c']] as $row){$stmt=$pdo->prepare('INSERT INTO recDetails VALUES (?,?,?,?)');$stmt->execute($row);}
$pdo->exec('SET collation_connection=utf8mb4_general_ci');
$db=new MysqlDatabase($pdo);$compiler=new FieldPredicateCompiler($db);$parser=new RecordQueryParser();
$pdo->exec("INSERT INTO defTerms VALUES (123,'Unrelated','999'),(5,'000123','other'),(6,'Category','000123')");
$stmt=$pdo->prepare('INSERT INTO defTerms VALUES (?,?,?)');$stmt->execute([7,'Other','a"b*\\c']);
$pdo->exec("INSERT INTO recDetails VALUES (10,10,5,'123'),(11,11,5,'5'),(12,12,5,'6'),(13,13,5,'7')");
$copy=0;
foreach(['000123'=>[1,4,5,11,12],'123'=>[7],'A"B*\\C'=>[6]] as $code=>$expected){
 $value='=='.$code;$q=json_encode([['f'=>$value]]);
 if($parser->normalize($q)!==[['f'=>$value]])throw new RuntimeException('Query changed literal');
 $state=new SqlBuildContext(['isDbOwner'=>true]);$sql=$compiler->anyFieldCondition($value,$state);
 // MySQL cannot reopen a temporary table in one UNION. Give every table
 // reference a separate connection-local copy of the same fixture rows.
 $sql='SELECT r.rec_ID FROM Records r WHERE '.$sql.' ORDER BY r.rec_ID';
 $sql=preg_replace_callback('/\b(FROM|JOIN) (Records|recDetails|defDetailTypes|defTerms)\b/',function($m)use($pdo,&$copy){
   $name='fixture_'.(++$copy);
   $pdo->exec('CREATE TEMPORARY TABLE '.$name.' LIKE '.$m[2]);
   $pdo->exec('INSERT INTO '.$name.' SELECT * FROM '.$m[2]);
   return $m[1].' '.$name;
 },$sql);
 $ids=array_map('intval',$db->fetchColumn($sql,$state->values()));
 if($ids!==$expected)throw new RuntimeException('Wrong exact results for '.$code.': '.json_encode($ids));
}
echo "Exact any-field lookup passed: different properties, titles, leading zeroes, substring exclusions, quotes, wildcards, backslashes and case-sensitive literals, and exact enum labels/codes.\n";
