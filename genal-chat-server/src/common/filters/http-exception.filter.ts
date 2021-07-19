import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter<HttpException> {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const status = exception.getStatus();
    const exceptionRes: any = exception.getResponse();
    const error = exceptionRes.error;
    let message = exceptionRes.message;

    if(status === 401) {
      message = 'Danh tính hết hạn, vui lòng đăng nhập lại';
    }
    response.status(200).json({
      code: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error,
      msg: message,
    });
  }
}