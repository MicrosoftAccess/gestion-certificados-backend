import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ICaseForm, newCase } from './entities/case.entity';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { IToken } from 'src/interfaces/users.interfaces';
import { UpdateCaseDto } from './dto/update-case.dto';
import * as fs from 'fs';
import { Prisma } from '@prisma/client';
import { MailerService } from '@nestjs-modules/mailer/dist/mailer.service';
import Handlebars from 'handlebars';
@Injectable()
export class CasesService {
  constructor(
    private _prisma: PrismaService,
    private _authService: AuthService,
    private _jwtService: JwtService,
    private _mailerService: MailerService,
  ) {}
  async create(
    createCaseDto: ICaseForm,
    filename: string,
  ): Promise<any | null> {
    if (createCaseDto.title=='' || createCaseDto.description=='' || createCaseDto.campus==null || createCaseDto.nrc==null){
      throw new Error()
    }
    const test = this._authService.getCurrentToken();
    const token:any = this._jwtService.decode(test.split(' ')[1]);
    const source = fs.readFileSync('./src/templates/email_template.html', 'utf-8');
    const template = Handlebars.compile(source);
    const htmlToSend = template({username: `${token.name} ${token.surname}`.toUpperCase()})
    const emails = []
    const vrEmails:any = await this._prisma.$queryRaw`SELECT "email","name","surname" FROM "User" WHERE "role"='VR'`
    
    let mails = vrEmails.forEach((item)=>emails.push(Object.values(item)[0]))
    this.sendEmail(
      token.email,
      `UNAB - ${token.name} ${token.surname}`.toUpperCase() + ' tu caso ha sido creado',
      htmlToSend,
      
    );
    const sourceVR = fs.readFileSync('./src/templates/email_template_approved.html', 'utf-8');
    const templateVR = Handlebars.compile(sourceVR);
    const htmlToSendVR = templateVR({username: "Usuario de Vicerrectoría",caseTitle: createCaseDto.title,studentName:`${token.name} ${token.surname}`.toUpperCase(),nrcName:createCaseDto.nrc.name,description:createCaseDto.description,status:'Creado'})
    this.sendEmail(
      emails,
      `UNAB - Hay un nuevo caso del alumno `+` ${token.name} ${token.surname}`.toUpperCase(),
      htmlToSendVR
    )
    return await this._prisma.case.create({
      data: {
        title: createCaseDto.title,
        campus: {
          connect: {
            id: createCaseDto.campus,
          },
        },
        description: createCaseDto.description,
        files: filename,
        student: {
          connect: {
            id: token.sub,
          },
        },
        professor: {
          connect: {
            id: createCaseDto.nrc.professorId,
          },
        },
        nrc: {
          connect: {
            id: createCaseDto.nrc.id,
          },
        },
      },
      include: {
        campus: true,
        student: {
          select: {
            name: true,
            surname: true,
            id: true,
            role: true,
            rut: true,
          },
        },
        professor: true,
      },
    });
  }

  async findAll(): Promise<newCase[] | null> {
    const test = this._authService.getCurrentToken();
    const token: IToken = this._jwtService.decode(test.split(' ')[1]) as IToken;

    const currentUser = await this._prisma.user.findFirst({
      where: { id: token.sub },
    });

    let condition = {};
    if (currentUser.role === 'PROFESSOR') {
      condition = {
        professorId: token.sub,
        OR: [{ status: 'SOLVED' }, { status: 'APPROVED' }],
      };
    } else if (currentUser.role === 'STUDENT') {
      condition = {
        studentId: token.sub,
      };
    } else {
      condition = {
        OR: [
          { status: 'SOLVED' },
          { status: 'APPROVED' },
          { status: 'UNSOLVED' },
          { status: 'REJECTED' },
        ],
      };
    }

    return await this._prisma.case.findMany({
      where: condition,
      orderBy: {
        id: 'desc',
      },
      include: {
        campus: true,
        nrc: true,
      },
    });
  }

  async findOne(id: number) {
    return await this._prisma.case.findFirst({
      where: { id: id },
      include: {
        professor: {
          select: {
            name: true,
            surname: true,
          },
        },
        student: {
          select: {
            name: true,
            surname: true,
            rut: true,
          },
        },
        VR: {
          select: {
            name: true,
            surname: true,
            rut: true,
          },
        },
      },
    });
  }

  async update(id: number, updateCaseDto: UpdateCaseDto) {
    const test = this._authService.getCurrentToken();
    const token: IToken = this._jwtService.decode(test.split(' ')[1]) as IToken;
    // const source = fs.readFileSync('../../templates/email_template.html', 'utf-8');
    
    
    
    const userName:any = await this._prisma.case.findFirst(
      {
        where:{
          id:id
        },
        include:{
          student:{
            select:{
              name:true,
              surname:true,
              email:true
            }
          },
          professor:{
            select:{
              name:true,
              surname:true,
              email:true
            }
          },
          nrc:{
            select:{
              name:true
            }
          }
        }
      }
      
    )
    
    let data = {};

    if (token.role == 'PROFESSOR') {
      if(updateCaseDto.response=='' || updateCaseDto.dateTest==null){
        throw new Error()
      }
      data = {
        response: updateCaseDto.response,
        status: 'SOLVED',
        respondedAt: new Date(),
        dateTest: updateCaseDto.dateTest,
        professor: {
          connect: {
            id: token.sub,
          },
        },
      };
      const source = fs.readFileSync('./src/templates/email_template_student.html', 'utf-8');
      const template = Handlebars.compile(source);
      const htmlToSend = template({username: `${userName.student.name} ${userName.student.surname}`.toUpperCase(),caseTitle:userName.title,response:updateCaseDto.response})
      await this.sendEmailProfessorUpdate(id, htmlToSend);
    } else {
      if(updateCaseDto.status==null || updateCaseDto.vrResponse==''){
        throw new Error()
      }
      data = {
        vrResponse: updateCaseDto.vrResponse,
        status: updateCaseDto.status,
        respondedAt: new Date(),
        VR: {
          connect: {
            id: token.sub,
          },
        },
      };
      if(updateCaseDto.status=='APPROVED'){
        const source = fs.readFileSync('./src/templates/email_template_approved.html', 'utf-8');
        const template = Handlebars.compile(source);
        const htmlToSend = template({username: `${userName.professor.name} ${userName.professor.surname}`.toUpperCase(),caseTitle: userName.title,studentName:`${userName.student.name} ${userName.student.surname}`.toUpperCase(),nrcName:userName.nrc.name,description:userName.description,status:'Aprobado'})
        await this.sendEmailVRUpdate(id, htmlToSend,userName.professor.email,updateCaseDto.status);
      }
      const sourceStudent = fs.readFileSync('./src/templates/email_template_vr.html', 'utf-8');
      const templateStudent = Handlebars.compile(sourceStudent);
      const htmlToSendStudent = templateStudent({username: `${userName.student.name} ${userName.student.surname}`.toUpperCase(),caseTitle: userName.title, response:updateCaseDto.vrResponse,status:this.statusTranslation(updateCaseDto.status)})
      await this.sendEmailVRUpdate(id, htmlToSendStudent,userName.student.email,updateCaseDto.status);
    }
    
    return await this._prisma.case.update({
      data,
      where: {
        id: id,
      },
    });
  }

  async sendEmailVRUpdate(id: number, html: string,email:string,caseInfo:any) {
    
    const caseData: any = await this._prisma.case.findFirst({
      where: {
        id: id,
      },
      include: {
        student: {
          select: {
            email: true,
            name: true,
            surname: true,
          },
        },
      },
    });
    this.sendEmail(
      email,
      `UNAB - ${caseData.student.name} ${caseData.student.surname}`.toUpperCase() + ` vicerrectoría ha ${this.statusTranslation(caseInfo)} un caso`,
      html,
    );
  }
  async sendEmailProfessorUpdate(id: number, html: string) {
    const caseData: any = await this._prisma.case.findFirst({
      where: {
        id: id,
      },
      include: {
        student: {
          select: {
            email: true,
            name: true,
            surname: true,
          },
        },
      },
    });
    this.sendEmail(
      caseData.student.email,
      `UNAB - ${caseData.student.name} ${caseData.student.surname}`.toUpperCase() + ' tu caso ha sido resuelto',
      html,
    );
  }

  async sendEmail(to: any, subject: string, html: any) {
    return await this._mailerService.sendMail({
      to: to,
      from: 'gestioncasosmailer@gmail.com',
      subject: subject,
      text: 'prueba',
      html: html,
    });
  }

  // async updateAsVr(id:number,updateCaseDto: UpdateCaseDto){
  //   const test = this._authService.getCurrentToken();
  //   const token: IToken = this._jwtService.decode(test.split(' ')[1]) as IToken;
  //   return await this._prisma.case.update({
  //     data:{
  //       status: updateCaseDto.status,
  //       vrResponse: updateCaseDto.vrResponse
  //     },
  //     where:{
  //       id:id
  //     }
  //   })
  // }

  statusTranslation(status:string){
    switch(status){
        case 'APPROVED':
          return 'APROBADO'
        case 'REJECTED':
          return 'RECHAZADO' 

    }
  }


  async generateReport(){
    // return await this._prisma.case.groupBy({
    //   by:['status'],
    //   _count:{
    //     _all: true,
    //   }
    // })

    return await this._prisma.$queryRaw(Prisma.sql`SELECT
    status,
    "professorId",
    u.NAME,
    u.surname,
    CAST ( "count" ( * ) AS INTEGER ) 
  FROM
    "Case" c 
    INNER JOIN "User" u ON "professorId" = u."id" 
  WHERE
    c."professorId" = u."id" 
  GROUP BY
    status,
    "professorId",
    u."name",
    u.surname
  ORDER BY
   "professorId"   `)

    // TRAE LA INFO DE LOS CASOS TOTALES DE LOS PROFES
    // return await this._prisma.user.findMany({
    //   where:{
    //     role:'PROFESSOR'
    //   },
    //   include:{
    //     _count:{
    //       select:{
    //         CaseProfessor:{
    //           where:{status:'REJECTED'}
    //         }
    //       }
    //     },
    //   }
    // })
  
  // return await this._prisma.case.findMany({
  //  where:{
  //   status:'REJECTED'
  //  },
  //  include:{

  //retorna todos los campus

   
        
  
  
  


}
  remove(id: number) {
    return `This action removes a #${id} case`;
  }
}
