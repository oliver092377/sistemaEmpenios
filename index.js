//import { createConnection } from 'mysql2'
import mysql from "mysql2/promise"

// Configuración de la conexión
const config = {
  host: 'localhost',      // Cambia esto si tu BD está en otro servidor
  user: 'root',
  port: 3306,
  password: '1234',
  database: 'mydb'
}

const connection = await mysql.createConnection(config)

try {
    // Hacer una consulta con `execute` en lugar de `query`
    const [rows] = await connection.execute('SELECT * FROM Empenios');
    console.log('Datos:', rows);
  } catch (err) {
    console.error('Error en la consulta:', err);
  } finally {
    await connection.end(); // Cierra la conexión al terminar
  }

/* 
export class Empenios{
    static async getAll (){
        
    }
}
*/
// Para cerrar la conexión (cuando sea necesario)
// connection.end();
