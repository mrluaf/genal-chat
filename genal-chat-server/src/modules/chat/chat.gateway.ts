import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, getRepository } from 'typeorm';
import { User } from '../user/entity/user.entity';
import { Group, GroupMap } from '../group/entity/group.entity';
import { GroupMessage } from '../group/entity/groupMessage.entity';
import { UserMap } from '../friend/entity/friend.entity';
import { FriendMessage } from '../friend/entity/friendMessage.entity';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { RCode } from 'src/common/constant/rcode';
import { nameVerify } from 'src/common/tool/utils';

@WebSocketGateway()
export class ChatGateway {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupMap)
    private readonly groupUserRepository: Repository<GroupMap>,
    @InjectRepository(GroupMessage)
    private readonly groupMessageRepository: Repository<GroupMessage>,
    @InjectRepository(UserMap)
    private readonly friendRepository: Repository<UserMap>,
    @InjectRepository(FriendMessage)
    private readonly friendMessageRepository: Repository<FriendMessage>,
  ) {
    this.defaultGroup = 'GeneralGroup';
  }

  @WebSocketServer()
  server: Server;

  // 默认群 Nhóm mặc định
  defaultGroup: string;

  // socket连接钩子
  async handleConnection(client: Socket): Promise<string> {
    const userRoom = client.handshake.query.userId;
    // 连接默认加入"GeneralGroup"房间 Kết nối để tham gia phòng "Astro Boy Chat Room" theo mặc định
    client.join(this.defaultGroup);
    // 进来统计一下在线人数 Hãy đến và đếm số người trực tuyến
    this.getActiveGroupUser();
    // 用户独有消息房间 根据 (Phòng thông điệp duy nhất của người dùng theo) userId
    if(userRoom) {
      client.join(userRoom);
    }
    return 'Kết nối thành công';
  }

  // socket断连钩子
  async handleDisconnect():Promise<any> {
    this.getActiveGroupUser();
  }

  // 创建群组
  @SubscribeMessage('addGroup')
  async addGroup(@ConnectedSocket() client: Socket, @MessageBody() data: Group):Promise<any> {
    const isUser = await this.userRepository.findOne({userId: data.userId});
    if(isUser) {
      const isHaveGroup = await this.groupRepository.findOne({ groupName: data.groupName });
      if (isHaveGroup) {
        this.server.to(data.userId).emit('addGroup', { code: RCode.FAIL, msg: 'Tên nhóm đã tồn tại', data: isHaveGroup });
        return;
      }
      if(!nameVerify(data.groupName)) {
        return;
      }
      data = await this.groupRepository.save(data);
      client.join(data.groupId);
      const group = await this.groupUserRepository.save(data);
      this.server.to(group.groupId).emit('addGroup', { code: RCode.OK, msg: `Đã tạo thành công nhóm ${data.groupName}`, data: group });
      this.getActiveGroupUser();
    } else{
      this.server.to(data.userId).emit('addGroup', { code: RCode.FAIL, msg: `Bạn không đủ điều kiện để tạo một nhóm` });
    }
  }

  // 加入群组 Tham gia nhóm
  @SubscribeMessage('joinGroup')
  async joinGroup(@ConnectedSocket() client: Socket, @MessageBody() data: GroupMap):Promise<any> {
    const isUser = await this.userRepository.findOne({userId: data.userId});
    if(isUser) {
      const group = await this.groupRepository.findOne({ groupId: data.groupId });
      let userGroup = await this.groupUserRepository.findOne({ groupId: group.groupId, userId: data.userId });
      const user = await this.userRepository.findOne({userId: data.userId});
      if (group && user) {
        if (!userGroup) {
          data.groupId = group.groupId;
          userGroup = await this.groupUserRepository.save(data);
        }
        client.join(group.groupId);
        const res = { group: group, user: user };
        this.server.to(group.groupId).emit('joinGroup', {
          code: RCode.OK,
          msg: `${user.username} Tham gia nhóm ${group.groupName}`,
          data: res
        });
        this.getActiveGroupUser();
      } else {
        this.server.to(data.userId).emit('joinGroup', { code: RCode.FAIL, msg: 'Không tham gia được vào nhóm', data: '' });
      }
    } else {
      this.server.to(data.userId).emit('joinGroup', { code: RCode.FAIL, msg: 'Bạn không đủ điều kiện để tham gia nhóm'});
    }
  }

  // 加入群组的socket连接
  @SubscribeMessage('joinGroupSocket')
  async joinGroupSocket(@ConnectedSocket() client: Socket, @MessageBody() data: GroupMap):Promise<any> {
    const group = await this.groupRepository.findOne({groupId: data.groupId});
    const user = await this.userRepository.findOne({userId: data.userId});
    if(group && user) {
      client.join(group.groupId);
      const res = { group: group, user: user};
      this.server.to(group.groupId).emit('joinGroupSocket', {code: RCode.OK, msg:`${user.username} Tham gia nhóm ${group.groupName}`, data: res});
    } else {
      this.server.to(data.userId).emit('joinGroupSocket', {code:RCode.FAIL, msg:'Không tham gia được vào nhóm', data:''});
    }
  }

  // 发送群消息 Gửi tin nhắn nhóm
  @SubscribeMessage('groupMessage')
  async sendGroupMessage(@MessageBody() data: GroupMessageDto):Promise<any> {
    const isUser = await this.userRepository.findOne({userId: data.userId});
    if(isUser) {
      const userGroupMap = await this.groupUserRepository.findOne({userId: data.userId, groupId: data.groupId});
      if(!userGroupMap || !data.groupId) {
        this.server.to(data.userId).emit('groupMessage',{code:RCode.FAIL, msg:'Lỗi gửi tin nhắn nhóm', data: ''});
        return;
      } 
      if(data.messageType === 'image') {
        const randomName = `${Date.now()}$${data.userId}$${data.width}$${data.height}`;
        const stream = createWriteStream(join('public/static', randomName));
        stream.write(data.content);
        data.content = randomName;
      }
      data.time = new Date().valueOf(); // 使用服务端时间 Sử dụng thời gian máy chủ
      await this.groupMessageRepository.save(data);
      this.server.to(data.groupId).emit('groupMessage', {code: RCode.OK, msg:'', data: data});
    } else {
      this.server.to(data.userId).emit('groupMessage', {code: RCode.FAIL, msg:'Bạn không đủ điều kiện để gửi tin nhắn' });
    }
  }

  // 添加好友 thêm bạn
  @SubscribeMessage('addFriend')
  async addFriend(@ConnectedSocket() client: Socket, @MessageBody() data: UserMap):Promise<any> {
    const isUser = await this.userRepository.findOne({userId: data.userId});
    if(isUser) {
      if (data.friendId && data.userId) {
        if (data.userId === data.friendId) {
          this.server.to(data.userId).emit('addFriend', { code: RCode.FAIL, msg: 'Không thể thêm tôi làm bạn', data: '' });
          return;
        }
        const relation1 = await this.friendRepository.findOne({ userId: data.userId, friendId: data.friendId });
        const relation2 = await this.friendRepository.findOne({ userId: data.friendId, friendId: data.userId });
        const roomId = data.userId > data.friendId ? data.userId + data.friendId : data.friendId + data.userId;

        if (relation1 || relation2) {
          this.server.to(data.userId).emit('addFriend', { code: RCode.FAIL, msg: 'Đã có người bạn này', data: data });
          return;
        }

        const friend = await this.userRepository.findOne({userId: data.friendId});
        const user = await this.userRepository.findOne({userId: data.userId});
        if (!friend) {
          this.server.to(data.userId).emit('addFriend', { code: RCode.FAIL, msg: 'Người bạn không tồn tại', data: '' });
          return;
        }

        // 双方都添加好友 并存入数据库  Cả hai bên thêm bạn bè và lưu trữ họ trong cơ sở dữ liệu
        await this.friendRepository.save(data);
        const friendData = JSON.parse(JSON.stringify(data));
        const friendId = friendData.friendId;
        friendData.friendId = friendData.userId;
        friendData.userId = friendId;
        delete friendData._id;
        await this.friendRepository.save(friendData);
        client.join(roomId);

        // 如果是删掉的好友重新加, 重新获取一遍私聊消息 Nếu người bạn đã xóa được thêm lại, hãy nhận lại tin nhắn trò chuyện riêng tư
        let messages = await getRepository(FriendMessage)
          .createQueryBuilder("friendMessage")
          .orderBy("friendMessage.time", "DESC")
          .where("friendMessage.userId = :userId AND friendMessage.friendId = :friendId", { userId: data.userId, friendId: data.friendId })
          .orWhere("friendMessage.userId = :friendId AND friendMessage.friendId = :userId", { userId: data.userId, friendId: data.friendId })
          .take(30)
          .getMany();
        messages = messages.reverse();

        if(messages.length) {
          // @ts-ignore
          friend.messages = messages;
          // @ts-ignore
          user.messages = messages;
        }
        
        this.server.to(data.userId).emit('addFriend', { code: RCode.OK, msg: `Thêm bạn ${friend.username} thành công`, data: friend });
        this.server.to(data.friendId).emit('addFriend', { code: RCode.OK, msg: `${user.username} Thêm bạn làm bạn`, data: user });
      }
    } else {
      this.server.to(data.userId).emit('addFriend', {code: RCode.FAIL, msg:'Bạn không đủ tư cách để làm bạn' });
    }
  }

  // 加入私聊的socket连接 Socket kết nối để tham gia trò chuyện riêng tư
  @SubscribeMessage('joinFriendSocket')
  async joinFriend(@ConnectedSocket() client: Socket, @MessageBody() data: UserMap):Promise<any> {
    if(data.friendId && data.userId) {
      const relation = await this.friendRepository.findOne({ userId: data.userId, friendId: data.friendId });
      const roomId = data.userId > data.friendId ?  data.userId + data.friendId : data.friendId + data.userId;
      if(relation) {
        client.join(roomId);
        this.server.to(data.userId).emit('joinFriendSocket',{ code:RCode.OK, msg:'Đã vào thành công cuộc trò chuyện riêng tư socket', data: relation });
      } 
    }
  }

  // 发送私聊消息 Gửi tin nhắn trò chuyện riêng tư
  @SubscribeMessage('friendMessage')
  async friendMessage(@ConnectedSocket() client: Socket, @MessageBody() data: FriendMessageDto):Promise<any> {
    const isUser = await this.userRepository.findOne({userId: data.userId});
    if(isUser) {
      if(data.userId && data.friendId) {
        const roomId = data.userId > data.friendId ? data.userId + data.friendId : data.friendId + data.userId;
        if(data.messageType === 'image') {
          const randomName = `${Date.now()}$${roomId}$${data.width}$${data.height}`;
          const stream = createWriteStream(join('public/static', randomName));
          stream.write(data.content);
          data.content = randomName;
        }
        data.time = new Date().valueOf();
        await this.friendMessageRepository.save(data);
        this.server.to(roomId).emit('friendMessage', {code: RCode.OK, msg:'', data});
      }
    } else {
      this.server.to(data.userId).emit('friendMessage', {code: RCode.FAIL, msg:'Bạn không đủ điều kiện để gửi một tin nhắn', data});
    }
  }

  // 获取所有群和好友数据 Nhận tất cả dữ liệu nhóm và bạn bè
  @SubscribeMessage('chatData') 
  async getAllData(@ConnectedSocket() client: Socket,  @MessageBody() user: User):Promise<any> {
    const isUser = await this.userRepository.findOne({userId: user.userId, password: user.password});
    if(isUser) {
      let groupArr: GroupDto[] = [];
      let friendArr: FriendDto[] = [];
      const userGather: {[key: string]: User} = {};
      let userArr: FriendDto[] = [];
    
      const groupMap: GroupMap[] = await this.groupUserRepository.find({userId: user.userId}); 
      const friendMap: UserMap[] = await this.friendRepository.find({userId: user.userId});

      const groupPromise = groupMap.map(async (item) => {
        return await this.groupRepository.findOne({groupId: item.groupId});
      });
      const groupMessagePromise = groupMap.map(async (item) => {
        let groupMessage = await getRepository(GroupMessage)
        .createQueryBuilder("groupMessage")
        .orderBy("groupMessage.time", "DESC")
        .where("groupMessage.groupId = :id", { id: item.groupId })
        .take(30)
        .getMany();
        groupMessage = groupMessage.reverse();
        // 这里获取一下发消息的用户的用户信息 Tại đây để lấy thông tin người dùng của người dùng đã gửi tin nhắn
        for(const message of groupMessage) {
          if(!userGather[message.userId]) {
            userGather[message.userId] = await this.userRepository.findOne({userId: message.userId});
          }
        }
        return groupMessage;
      });

      const friendPromise = friendMap.map(async (item) => {
        return await this.userRepository.findOne({
          where:{userId: item.friendId}
        });
      });
      const friendMessagePromise = friendMap.map(async (item) => {
        const messages = await getRepository(FriendMessage)
          .createQueryBuilder("friendMessage")
          .orderBy("friendMessage.time", "DESC")
          .where("friendMessage.userId = :userId AND friendMessage.friendId = :friendId", { userId: item.userId, friendId: item.friendId })
          .orWhere("friendMessage.userId = :friendId AND friendMessage.friendId = :userId", { userId: item.userId, friendId: item.friendId })
          .take(30)
          .getMany();
        return messages.reverse();
      });

      const groups: GroupDto[]  = await Promise.all(groupPromise);
      const groupsMessage: Array<GroupMessageDto[]> = await Promise.all(groupMessagePromise);
      groups.map((group,index)=>{
        if(groupsMessage[index] && groupsMessage[index].length) {
          group.messages = groupsMessage[index];
        }
      });
      groupArr = groups;

      const friends: FriendDto[] = await Promise.all(friendPromise);
      const friendsMessage: Array<FriendMessageDto[]> = await Promise.all(friendMessagePromise);
      friends.map((friend, index) => {
        if(friendsMessage[index] && friendsMessage[index].length) {
          friend.messages = friendsMessage[index];
        }
      });
      friendArr = friends;
      userArr = [...Object.values(userGather), ...friendArr];

      this.server.to(user.userId).emit('chatData', {code:RCode.OK, msg: 'Nhận dữ liệu trò chuyện thành công', data: {
        groupData: groupArr,
        friendData: friendArr,
        userData: userArr
      }});
    }
  }

  // 退群
  @SubscribeMessage('exitGroup') 
  async exitGroup(@ConnectedSocket() client: Socket,  @MessageBody() groupMap: GroupMap):Promise<any> {
    if(groupMap.groupId === this.defaultGroup) {
      return this.server.to(groupMap.userId).emit('exitGroup',{code: RCode.FAIL, msg: 'Nhóm mặc định không được thoát'});
    }
    const user = await this.userRepository.findOne({userId: groupMap.userId});
    const group = await this.groupRepository.findOne({groupId: groupMap.groupId});
    const map = await this.groupUserRepository.findOne({userId: groupMap.userId, groupId: groupMap.groupId});
    if(user && group && map) {
      await this.groupUserRepository.remove(map);
      this.server.to(groupMap.userId).emit('exitGroup',{code: RCode.OK, msg: 'Thoát thành công', data: groupMap});
      return this.getActiveGroupUser();
    }
    this.server.to(groupMap.userId).emit('exitGroup',{code: RCode.FAIL, msg: 'Không rời khỏi nhóm được'});
  }

  // 删好友
  @SubscribeMessage('exitFriend') 
  async exitFriend(@ConnectedSocket() client: Socket,  @MessageBody() userMap: UserMap):Promise<any> {
    const user = await this.userRepository.findOne({userId: userMap.userId});
    const friend = await this.userRepository.findOne({userId: userMap.friendId});
    const map1 = await this.friendRepository.findOne({userId: userMap.userId, friendId: userMap.friendId});
    const map2 = await this.friendRepository.findOne({userId: userMap.friendId, friendId: userMap.userId});
    if(user && friend && map1 && map2) {
      await this.friendRepository.remove(map1);
      await this.friendRepository.remove(map2);
      return this.server.to(userMap.userId).emit('exitFriend',{code: RCode.OK, msg: 'Đã xóa bạn bè thành công', data: userMap});
    }
    this.server.to(userMap.userId).emit('exitFriend',{code: RCode.FAIL, msg: 'Không xóa được bạn bè'});
  }

  // 获取在线用户
  async getActiveGroupUser() {
    // 从socket中找到连接人数
    // @ts-ignore;
    let userIdArr = Object.values(this.server.engine.clients).map(item=>{
      // @ts-ignore;
      return item.request._query.userId;
    });
    // 数组去重
    userIdArr = Array.from(new Set(userIdArr));

    const activeGroupUserGather = {};
    for(const userId of userIdArr) {
      const userGroupArr = await this.groupUserRepository.find({userId: userId});
      const user = await this.userRepository.findOne({userId: userId});
      if(user && userGroupArr.length) {
        userGroupArr.map(item => {
          if(!activeGroupUserGather[item.groupId]) {
            activeGroupUserGather[item.groupId] = {};
          }
          activeGroupUserGather[item.groupId][userId] = user;
        });
      }
    }

    this.server.to(this.defaultGroup).emit('activeGroupUser',{
      msg: 'activeGroupUser', 
      data: activeGroupUserGather
    });
  }
}
